# api/auth.py — Login (JWT) and /me. All protected routes use get_current_user from core.security.

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from core.security import (
    DEMO_USERS,
    create_access_token,
    get_current_user,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/token")
async def login(form: OAuth2PasswordRequestForm = Depends()) -> dict[str, Any]:
    user = DEMO_USERS.get(form.username)
    if not user or not verify_password(form.password, user["hashed_password"]):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )
    token = create_access_token({"sub": form.username})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "entity": user["entity"],
        },
    }


@router.get("/me")
async def get_me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return current_user
