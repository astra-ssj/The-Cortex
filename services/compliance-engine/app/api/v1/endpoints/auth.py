# auth — Minimal auth stub (compliance-engine). Token/me for report auth.

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)
router = APIRouter()


async def _get_current_user_optional(token: str = Depends(oauth2_scheme)) -> dict[str, Any] | None:
    if not token:
        return None
    return {"sub": "demo", "username": "demo@astralabs.demo"}


@router.post("/token", summary="Obtain token")
async def token(username: str = "demo", password: str = "demo") -> dict[str, Any]:
    """Stub: return a token for demo."""
    return {"access_token": "TOKEN", "token_type": "bearer"}


@router.get("/me", summary="Current user")
async def me(user: dict[str, Any] | None = Depends(_get_current_user_optional)) -> dict[str, Any]:
    """Stub: return current user or anonymous."""
    if user:
        return user
    return {"sub": "anonymous", "username": "anonymous"}
