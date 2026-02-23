# core/security.py — JWT auth and RBAC. Demo users in-memory; replace with DB in production.

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY = "cortex-dev-secret-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours

pwd_context = CryptContext(schemes=["bcrypt"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

# Demo users — replace with DB in production
DEMO_USERS: dict[str, dict[str, Any]] = {
    "ciso@astralabs.com": {
        "name": "Group CISO",
        "email": "ciso@astralabs.com",
        "role": "ciso",
        "hashed_password": pwd_context.hash("cortex-ciso-2026"),
        "entity": "AstraLabs Group",
    },
    "dpo@astralabs.com": {
        "name": "Group DPO",
        "email": "dpo@astralabs.com",
        "role": "dpo",
        "hashed_password": pwd_context.hash("cortex-dpo-2026"),
        "entity": "AstraLabs Group",
    },
    "auditor@astralabs.com": {
        "name": "External Auditor",
        "email": "auditor@astralabs.com",
        "role": "auditor",
        "hashed_password": pwd_context.hash("cortex-audit-2026"),
        "entity": "External",
    },
}


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict[str, Any]) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({**data, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def _decode_user(token: str) -> dict[str, Any]:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    email = payload.get("sub")
    if email not in DEMO_USERS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return DEMO_USERS[email]


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict[str, Any]:
    try:
        return _decode_user(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


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
    try:
        return _decode_user(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def get_current_user_stream(request: Request = Depends()) -> dict[str, Any]:
    """Dependency for SSE endpoints: auth via query param 'token' or Authorization header."""
    token = request.query_params.get("token")
    return get_current_user_query_or_header(request, token)
