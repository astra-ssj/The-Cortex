# auth — Minimal auth stub (compliance-engine). Token/me for report auth.

from __future__ import annotations

import os
import secrets
from typing import Any

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)
router = APIRouter()

_STUB_USER = os.getenv("COMPLIANCE_ENGINE_STUB_USER", "demo").strip()
_STUB_PASSWORD = os.getenv("COMPLIANCE_ENGINE_STUB_PASSWORD", "").strip()
_STUB_ACCESS = os.getenv("COMPLIANCE_ENGINE_STUB_ACCESS_TOKEN", "").strip()


async def _get_current_user_optional(token: str = Depends(oauth2_scheme)) -> dict[str, Any] | None:
    if not token:
        return None
    if _STUB_ACCESS and secrets.compare_digest(token, _STUB_ACCESS):
        return {"sub": "demo", "username": "demo@astralabs.demo"}
    return None


@router.post("/token", summary="Obtain token")
async def token(username: str = Form(...), password: str = Form(...)) -> dict[str, Any]:
    """Stub: credentials and bearer value come from env (no hardcoded secrets)."""
    if not _STUB_PASSWORD or not _STUB_ACCESS:
        raise HTTPException(
            status_code=503,
            detail=(
                "Stub auth not configured: set COMPLIANCE_ENGINE_STUB_PASSWORD and "
                "COMPLIANCE_ENGINE_STUB_ACCESS_TOKEN"
            ),
        )
    if not (
        secrets.compare_digest(username, _STUB_USER)
        and secrets.compare_digest(password, _STUB_PASSWORD)
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"access_token": _STUB_ACCESS, "token_type": "bearer"}


@router.get("/me", summary="Current user")
async def me(user: dict[str, Any] | None = Depends(_get_current_user_optional)) -> dict[str, Any]:
    """Stub: return current user or anonymous."""
    if user:
        return user
    return {"sub": "anonymous", "username": "anonymous"}
