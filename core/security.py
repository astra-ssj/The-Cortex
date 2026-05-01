# core/security.py — JWT auth and RBAC. Demo users in-memory; DB-backed users via api/auth.

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
import secrets as secrets_stdlib
from typing import Any, Optional

import bcrypt
import structlog
from jose import JWTError, jwt
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

logger = structlog.get_logger()

# Dev-only signing material if JWT_SECRET unset (not a credential; suppress false-positive hardcoded-password rules).
_DEV_SECRET_DEFAULT = "cortex-dev-jwt-signing-placeholder-not-for-production"  # nosec B105
SECRET_KEY = (
    os.getenv("JWT_SECRET")
    or os.getenv("CORTEX_SECRET_KEY")
    or _DEV_SECRET_DEFAULT
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours max

if SECRET_KEY == _DEV_SECRET_DEFAULT:
    logger.warning(
        "jwt_secret_default",
        message="JWT_SECRET/CORTEX_SECRET_KEY not set — using dev default. Set JWT_SECRET in production.",
    )


def _token_bypass_allowed() -> bool:
    return os.getenv("CORTEX_ALLOW_TOKEN_BYPASS", "").lower() in ("1", "true", "yes")


def _token_bypass_expected() -> str:
    """Raw token value for dev bypass (never hardcode in source)."""
    return os.getenv("CORTEX_TOKEN_BYPASS_VALUE", "").strip()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

# Demo users — pre-computed bcrypt hashes (passlib 1.7.4 + bcrypt backend fails at import in some Docker envs).
DEMO_USERS: dict[str, dict[str, Any]] = {
    "ciso@astralabs.com": {
        "name": "Group CISO",
        "email": "ciso@astralabs.com",
        "role": "ciso",
        "hashed_password": "$2b$12$Dd2gDvE6wOyJHfCXF75f4eY2eUGVtXX7LPS1VkENlmBRcftj2F/XO",  # nosemgrep
        "entity": "AstraLabs Group",
    },
    "dpo@astralabs.com": {
        "name": "Group DPO",
        "email": "dpo@astralabs.com",
        "role": "dpo",
        "hashed_password": "$2b$12$fFcbjpxlNEYBmZQDpauZ5eDSGyM59Ns3MjPR5qChIKuTCG/TAU3r6",  # nosemgrep
        "entity": "AstraLabs Group",
    },
    "auditor@astralabs.com": {
        "name": "External Auditor",
        "email": "auditor@astralabs.com",
        "role": "auditor",
        "hashed_password": "$2b$12$LQRVBphdxYL4M72FGLHBj.1FmlYRh9E55avcD8icbCWiGo6tgEiWK",  # nosemgrep
        "entity": "External",
    },
}


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict[str, Any]) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return str(jwt.encode({**data, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM))


def _claims_user(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalise JWT claims into the dependency dict used across routers."""
    email = payload.get("email") or ""
    name = payload.get("name") or payload.get("full_name") or email or ""
    entity = payload.get("entity") or payload.get("org_name") or ""
    role_raw = payload.get("role", "CISO")
    return {
        "sub": payload.get("sub"),
        "user_id": str(payload.get("sub") or ""),
        "email": email,
        "role": str(role_raw).lower() if isinstance(role_raw, str) else role_raw,
        "org_id": str(payload.get("org_id") or ""),
        "name": name,
        "entity": entity,
        "is_demo": bool(payload.get("is_demo", False)),
        "onboarding_complete": bool(payload.get("onboarding_complete", False)),
        "onboarding_step": int(payload.get("onboarding_step", 0)),
    }


def _decode_user(token: str) -> dict[str, Any]:
    expected = _token_bypass_expected()
    if _token_bypass_allowed() and expected and secrets_stdlib.compare_digest(token, expected):
        logger.warning("jwt_token_bypass_used")
        return {
            "sub": "token-bypass",
            "user_id": "token-bypass",
            "email": "demo@astralabs.demo",
            "role": "ciso",
            "org_id": "demo-org-001",
            "name": "Demo User",
            "entity": "AstraLabs Group",
            "is_demo": True,
            "onboarding_complete": True,
            "onboarding_step": 5,
        }
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from None

    if payload.get("org_id"):
        return _claims_user(payload)

    email = payload.get("sub")
    if isinstance(email, str) and email in DEMO_USERS:
        u = DEMO_USERS[email]
        return {
            "sub": email,
            "user_id": email,
            "email": email,
            "role": u["role"],
            "org_id": "demo-org-001",
            "name": u["name"],
            "entity": u["entity"],
            "is_demo": True,
            "onboarding_complete": True,
            "onboarding_step": 5,
        }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict[str, Any]:
    return _decode_user(token)


def get_current_user_query_or_header(
    request: Request,
    token_query: str | None = None,
) -> dict[str, Any]:
    """Resolve user from query param (for SSE; EventSource cannot send headers) or Authorization header."""
    token: str | None = token_query
    if not token:
        auth = request.headers.get("Authorization")
        if auth and auth.startswith("Bearer "):
            token = auth[7:].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return _decode_user(token)


async def get_current_user_stream(request: Request = Depends()) -> dict[str, Any]:
    """Dependency for SSE endpoints: auth via query param 'token' or Authorization header."""
    token = request.query_params.get("token")
    return get_current_user_query_or_header(request, token)


async def get_current_user_optional(
    request: Request,
    token_header: Optional[str] = Header(None, alias="Authorization"),
) -> dict[str, Any]:
    """Auth for SSE/stream: try Authorization header first, then query param 'token'."""
    token: Optional[str] = None
    if token_header and token_header.startswith("Bearer "):
        token = token_header.split(" ", 1)[1].strip()
    if not token:
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return _decode_user(token)
