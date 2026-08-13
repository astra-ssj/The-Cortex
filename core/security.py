# core/security.py — JWT auth, token versioning, async principal resolution, API keys.

from __future__ import annotations

import os
import secrets as secrets_stdlib
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
import structlog
from jose import JWTError, jwt
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.canonical_roles import normalize_canonical_role
from core.tenant import set_tenant_context
from db.deps import get_db

logger = structlog.get_logger()

_DEV_SECRET_DEFAULT = "cortex-dev-jwt-signing-placeholder-not-for-production"  # nosec B105


def _dev_secret_opt_in() -> bool:
    return os.getenv("CORTEX_TESTING", "").lower() in ("1", "true", "yes") or os.getenv(
        "CORTEX_ALLOW_DEV_JWT_SECRET", ""
    ).lower() in ("1", "true", "yes")


_configured_secret = os.getenv("JWT_SECRET") or os.getenv("CORTEX_SECRET_KEY")
if not _configured_secret and not _dev_secret_opt_in():
    # Fail closed rather than fall back to a key that ships in this repo. That key
    # lets anyone mint a token for any org_id, and because RLS binds app.current_org
    # from that claim, forged tokens defeat tenant isolation as well as authentication.
    raise RuntimeError(
        "JWT_SECRET (or CORTEX_SECRET_KEY) must be set. "
        "For local development only, set CORTEX_ALLOW_DEV_JWT_SECRET=1 to accept the "
        "insecure built-in key."
    )

SECRET_KEY = _configured_secret or _DEV_SECRET_DEFAULT
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

if SECRET_KEY == _DEV_SECRET_DEFAULT:
    logger.warning(
        "jwt_secret_default",
        message="Using the built-in dev JWT key — tokens are forgeable. Never enable this outside local dev.",
    )


def _token_bypass_allowed() -> bool:
    return os.getenv("CORTEX_ALLOW_TOKEN_BYPASS", "").lower() in ("1", "true", "yes")


def _token_bypass_expected() -> str:
    return os.getenv("CORTEX_TOKEN_BYPASS_VALUE", "").strip()


http_bearer_optional = HTTPBearer(auto_error=False)


def _demo_users_enabled() -> bool:
    return os.getenv("CORTEX_TESTING", "").lower() in ("1", "true", "yes") or os.getenv(
        "CORTEX_ENABLE_DEMO_USERS", ""
    ).lower() in ("1", "true", "yes")


# These accounts authenticate against password hashes committed to this repo, and the
# plaintext is published in README/tests — so they are a standing credential unless
# explicitly opted in. Off by default; DEMO_USERS is empty in a default deployment.
_DEMO_USER_SEED: dict[str, dict[str, Any]] = {
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

DEMO_USERS: dict[str, dict[str, Any]] = _DEMO_USER_SEED if _demo_users_enabled() else {}


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict[str, Any], expires_minutes: int | None = None) -> str:
    minutes = expires_minutes if expires_minutes is not None else ACCESS_TOKEN_EXPIRE_MINUTES
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return str(jwt.encode({**data, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM))


def _claims_user(payload: dict[str, Any]) -> dict[str, Any]:
    email = payload.get("email") or ""
    name = payload.get("name") or payload.get("full_name") or email or ""
    entity = payload.get("entity") or payload.get("org_name") or ""
    role_raw = payload.get("role", "viewer")
    canonical = normalize_canonical_role(str(role_raw) if role_raw is not None else None)
    return {
        "sub": payload.get("sub"),
        "user_id": str(payload.get("sub") or ""),
        "email": email,
        "role": canonical.value,
        "canonical_role": canonical.value,
        "org_id": str(payload.get("org_id") or ""),
        "name": name,
        "entity": entity,
        "is_demo": bool(payload.get("is_demo", False)),
        "onboarding_complete": bool(payload.get("onboarding_complete", False)),
        "onboarding_step": int(payload.get("onboarding_step", 0)),
    }


async def decode_access_token_async(session: AsyncSession, token: str) -> dict[str, Any]:
    """Validate JWT and token_version for DB-backed sessions."""
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

    sub = payload.get("sub")
    org_id = payload.get("org_id")
    tv = payload.get("tv")

    if isinstance(sub, str) and sub in DEMO_USERS:
        u = DEMO_USERS[sub]
        demo_role = normalize_canonical_role(u["role"])
        return {
            "sub": sub,
            "user_id": sub,
            "email": sub,
            "role": demo_role.value,
            "canonical_role": demo_role.value,
            "org_id": "demo-org-001",
            "name": u["name"],
            "entity": u["entity"],
            "is_demo": True,
            "onboarding_complete": True,
            "onboarding_step": 5,
        }

    if payload.get("is_demo") is True:
        return _claims_user(payload)

    if org_id and tv is not None and sub:
        res = await session.execute(
            text("SELECT token_version FROM users WHERE id = :id AND is_active = TRUE"),
            {"id": str(sub)},
        )
        db_tv = res.scalar_one_or_none()
        if db_tv is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
        if int(db_tv) != int(tv):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session invalidated — sign in again",
            )
        return _claims_user(payload)

    if org_id and tv is None:
        # Legacy / synthetic JWTs (signed claims only; DB sessions always include ``tv``).
        return _claims_user(payload)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )


async def get_current_user(
    session: AsyncSession = Depends(get_db),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer_optional),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> dict[str, Any]:
    """Bearer JWT (with token_version) or ``X-API-Key`` for service-to-service calls."""
    if x_api_key:
        from core.api_key_service import resolve_api_key_principal

        principal = await resolve_api_key_principal(session, x_api_key)
    elif not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    else:
        principal = await decode_access_token_async(session, credentials.credentials)

    # Bind RLS to JWT/API-key org for this transaction (demo re-bind happens via bind_scoped_org).
    org_id = str(principal.get("org_id") or "").strip()
    if org_id:
        await set_tenant_context(session, org_id)
    return principal


async def get_current_user_query_or_header(
    request: Request,
    session: AsyncSession = Depends(get_db),
    token_query: str | None = None,
) -> dict[str, Any]:
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
    principal = await decode_access_token_async(session, token)
    org_id = str(principal.get("org_id") or "").strip()
    if org_id:
        await set_tenant_context(session, org_id)
    return principal


async def get_current_user_stream(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    token = request.query_params.get("token")
    return await get_current_user_query_or_header(request, session, token)


async def get_current_user_optional(
    request: Request,
    session: AsyncSession = Depends(get_db),
    token_header: Optional[str] = Header(None, alias="Authorization"),
) -> dict[str, Any]:
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
    principal = await decode_access_token_async(session, token)
    org_id = str(principal.get("org_id") or "").strip()
    if org_id:
        await set_tenant_context(session, org_id)
    return principal
