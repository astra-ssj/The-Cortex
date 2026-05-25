# api/auth.py — Login (JWT + refresh), registration, lockout, password reset, onboarding, API keys.

from __future__ import annotations

import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.limits import limiter
from core.audit_fabric import append_audit_log
from core.api_key_service import API_KEY_PREFIX
from core.auth_opaque import hash_opaque_token as _hash_opaque
from core.password_reset import consume_reset_token, issue_reset_token
from core.refresh_tokens import issue_refresh_token, revoke_all_refresh_for_user, take_refresh_token
from core.security import (
    DEMO_USERS,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from db.session import ensure_org_onboarding_schema

logger = structlog.get_logger()

router = APIRouter(prefix="/auth", tags=["auth"])

_LEGACY_DEMO_USER = os.getenv("CORTEX_LEGACY_DEMO_USER", "admin").strip()
_LEGACY_DEMO_PASSWORD = os.getenv("CORTEX_LEGACY_DEMO_PASSWORD", "").strip()

LOGIN_MAX_ATTEMPTS = int(os.getenv("CORTEX_LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_LOCKOUT_MINUTES = int(os.getenv("CORTEX_LOGIN_LOCKOUT_MINUTES", "15"))

# Constant bcrypt hash used to equalise response timing for unknown accounts (mitigates user enumeration).
_DUMMY_PASSWORD_HASH = "$2b$12$Dd2gDvE6wOyJHfCXF75f4eY2eUGVtXX7LPS1VkENlmBRcftj2F/XO"  # nosec B105


class RegisterBody(BaseModel):
    company_name: str = Field(..., min_length=1)
    jurisdiction: str = Field(default="EU")
    industry: str = ""
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8)
    full_name: str = ""


class OnboardingStepBody(BaseModel):
    step: int = Field(..., ge=1, le=3)
    data: dict[str, Any] = Field(default_factory=dict)


class RefreshBody(BaseModel):
    refresh_token: str = Field(..., min_length=10)


class ForgotPasswordBody(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)


class ResetPasswordBody(BaseModel):
    token: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8)


class ChangePasswordBody(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)


class ServiceKeyCreateBody(BaseModel):
    label: str = Field(default="integration", max_length=120)


def _db_email_for_login(username: str) -> str:
    u = username.strip()
    if u.lower() == "admin":
        return "admin@astralabs.com"
    return u


async def _try_load_db_user(session: AsyncSession, email: str) -> dict[str, Any] | None:
    try:
        res = await session.execute(
            text(
                """
                SELECT u.id::text AS id, u.email::text AS email, u.password_hash::text AS password_hash,
                       u.role::text AS role, u.org_id::text AS org_id,
                       COALESCE(o.is_demo, FALSE) AS is_demo,
                       COALESCE(o.onboarding_complete, FALSE) AS onboarding_complete,
                       COALESCE(o.onboarding_step, 0) AS onboarding_step,
                       COALESCE(u.token_version, 1) AS token_version,
                       COALESCE(u.failed_login_attempts, 0) AS failed_login_attempts,
                       u.locked_until AS locked_until
                FROM users u
                JOIN organizations o ON o.id = u.org_id
                WHERE u.email = :email AND u.is_active = TRUE
                """
            ),
            {"email": email},
        )
        row = res.mappings().one_or_none()
        return dict(row) if row else None
    except Exception as e:
        await session.rollback()
        logger.warning("auth_db_user_lookup_skipped", error=str(e))
        return None


def _token_for_db_user(user_row: dict[str, Any]) -> str:
    return create_access_token(
        {
            "sub": user_row["id"],
            "email": user_row["email"],
            "org_id": user_row["org_id"],
            "role": user_row["role"],
            "is_demo": user_row["is_demo"],
            "onboarding_complete": user_row["onboarding_complete"],
            "onboarding_step": user_row["onboarding_step"],
            "tv": int(user_row.get("token_version", 1)),
        }
    )


def _locked_now(locked_until: Any) -> bool:
    if locked_until is None:
        return False
    if isinstance(locked_until, datetime):
        lu = locked_until
        if lu.tzinfo is None:
            lu = lu.replace(tzinfo=timezone.utc)
        return lu > datetime.now(timezone.utc)
    return False


@router.get("/csrf-token")
async def get_csrf_token(response: Response) -> dict[str, str]:
    """Double-submit CSRF token (pair with cookie ``cortex_csrf`` when ``CORTEX_CSRF_PROTECT`` is enabled)."""
    tok = secrets.token_urlsafe(32)
    response.set_cookie(
        key="cortex_csrf",
        value=tok,
        httponly=False,
        samesite="lax",
        secure=os.getenv("CORTEX_COOKIE_SECURE", "").lower() in ("1", "true", "yes"),
        path="/",
        max_age=3600,
    )
    return {"csrf_token": tok}


@router.post("/register")
@limiter.limit("5/minute")
async def register(
    request: Request,
    payload: RegisterBody,
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create organisation + admin user; return access + refresh tokens."""
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    try:
        existing = (
            await session.execute(
                text("SELECT id FROM users WHERE email = :email"),
                {"email": str(payload.email)},
            )
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")

        org_id = f"org-{uuid.uuid4().hex[:12]}"
        await session.execute(
            text(
                """
                INSERT INTO organizations (
                    id, name, jurisdiction, industry,
                    purpose_tags, region, description, metadata,
                    onboarding_complete, onboarding_step,
                    entity_structure, is_demo, created_by, selected_frameworks
                )
                VALUES (
                    :id, :name, :jurisdiction, :industry,
                    '[]'::jsonb, NULL, '', '{}'::jsonb,
                    FALSE, 1,
                    'single', FALSE, :created_by, ARRAY[]::TEXT[]
                )
                """
            ),
            {
                "id": org_id,
                "name": payload.company_name.strip(),
                "jurisdiction": payload.jurisdiction.strip() or "EU",
                "industry": payload.industry.strip(),
                "created_by": str(payload.email),
            },
        )

        user_id = str(uuid.uuid4())
        await session.execute(
            text(
                """
                INSERT INTO users (id, email, password_hash, full_name, org_id, role)
                VALUES (:id, :email, :password_hash, :full_name, :org_id, 'ADMIN')
                """
            ),
            {
                "id": user_id,
                "email": str(payload.email),
                "password_hash": hash_password(payload.password),
                "full_name": payload.full_name.strip(),
                "org_id": org_id,
            },
        )
    except HTTPException:
        await session.rollback()
        raise
    except SQLAlchemyError as e:
        await session.rollback()
        logger.warning("register_db_error", error=str(e))
        raise HTTPException(
            status_code=503,
            detail="Registration unavailable — database unreachable or migrations not applied",
        ) from e

    user_row = {
        "id": user_id,
        "email": str(payload.email),
        "org_id": org_id,
        "role": "ADMIN",
        "is_demo": False,
        "onboarding_complete": False,
        "onboarding_step": 1,
        "token_version": 1,
    }
    access = _token_for_db_user(user_row)
    refresh = await issue_refresh_token(
        session,
        user_id=user_id,
        refresh_ttl_days=REFRESH_TOKEN_EXPIRE_DAYS,
    )

    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": 60 * int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")),
        "org_id": org_id,
        "onboarding_step": 1,
        "message": "Account created. Complete setup.",
    }


@router.post("/token")
@limiter.limit("10/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    username = (form_data.username or "").strip()
    password = form_data.password or ""

    db_user = await _try_load_db_user(session, _db_email_for_login(username))
    if db_user:
        if _locked_now(db_user.get("locked_until")):
            raise HTTPException(
                status_code=403,
                detail="Account temporarily locked — try again later",
            )
        if verify_password(password, db_user["password_hash"]):
            await session.execute(
                text(
                    """
                    UPDATE users SET failed_login_attempts = 0, locked_until = NULL
                    WHERE id = :id
                    """
                ),
                {"id": db_user["id"]},
            )
            access = _token_for_db_user(db_user)
            refresh = await issue_refresh_token(
                session,
                user_id=str(db_user["id"]),
                refresh_ttl_days=REFRESH_TOKEN_EXPIRE_DAYS,
            )
            return {
                "access_token": access,
                "refresh_token": refresh,
                "token_type": "bearer",
                "expires_in": 60 * int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")),
                "org_id": db_user["org_id"],
                "role": db_user["role"],
                "is_demo": db_user["is_demo"],
                "onboarding_complete": db_user["onboarding_complete"],
                "onboarding_step": db_user["onboarding_step"],
                "user": {
                    "name": db_user["email"].split("@")[0],
                    "email": db_user["email"],
                    "role": db_user["role"],
                    "entity": db_user["org_id"],
                    "org_id": db_user["org_id"],
                    "is_demo": db_user["is_demo"],
                    "onboarding_complete": db_user["onboarding_complete"],
                    "onboarding_step": db_user["onboarding_step"],
                },
            }

        r = await session.execute(
            text(
                """
                UPDATE users SET failed_login_attempts = failed_login_attempts + 1
                WHERE id = :id
                RETURNING failed_login_attempts
                """
            ),
            {"id": db_user["id"]},
        )
        n = r.scalar_one()
        if n >= LOGIN_MAX_ATTEMPTS:
            await session.execute(
                text(
                    """
                    UPDATE users SET locked_until = NOW() + (:mins * INTERVAL '1 minute')
                    WHERE id = :id
                    """
                ),
                {"mins": LOGIN_LOCKOUT_MINUTES, "id": db_user["id"]},
            )
            logger.warning("account_locked", email=db_user["email"], attempts=n)
        # Persist the failed-attempt/lockout state now; the request ends in a 401 below,
        # which would otherwise roll back the request transaction and discard the increment.
        await session.commit()
    else:
        # Equalise timing for unknown accounts so response latency does not reveal which emails exist.
        verify_password(password, _DUMMY_PASSWORD_HASH)

    demo = DEMO_USERS.get(username)
    if demo and verify_password(password, demo["hashed_password"]):
        token = create_access_token({"sub": username})
        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_in": 60 * int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")),
            "org_id": "demo-org-001",
            "role": demo["role"],
            "is_demo": True,
            "onboarding_complete": True,
            "onboarding_step": 5,
            "user": {
                "name": demo["name"],
                "email": demo["email"],
                "role": demo["role"],
                "entity": demo["entity"],
                "org_id": "demo-org-001",
                "is_demo": True,
                "onboarding_complete": True,
                "onboarding_step": 5,
            },
        }

    _uname_ok = username == _LEGACY_DEMO_USER or username.lower() == "admin@astralabs.com"
    if (
        _LEGACY_DEMO_PASSWORD
        and _uname_ok
        and secrets.compare_digest(password, _LEGACY_DEMO_PASSWORD)
    ):
        token = create_access_token(
            {
                "sub": "demo-user-001",
                "email": "admin@astralabs.com",
                "org_id": "demo-org-001",
                "role": "CISO",
                "is_demo": True,
                "onboarding_complete": True,
                "onboarding_step": 5,
            }
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_in": 60 * int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")),
            "org_id": "demo-org-001",
            "role": "CISO",
            "is_demo": True,
            "onboarding_complete": True,
            "onboarding_step": 5,
            "user": {
                "name": "Group CISO",
                "email": "admin@astralabs.com",
                "role": "CISO",
                "entity": "AstraLabs Group",
                "org_id": "demo-org-001",
                "is_demo": True,
                "onboarding_complete": True,
                "onboarding_step": 5,
            },
        }

    raise HTTPException(status_code=401, detail="Invalid email or password")


@router.post("/refresh")
@limiter.limit("30/minute")
async def refresh_session(
    request: Request,
    body: RefreshBody,
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Rotate refresh token and issue new access token."""
    uid = await take_refresh_token(session, body.refresh_token)
    if uid is None:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    row = (
        await session.execute(
            text(
                """
                SELECT u.id::text AS id, u.email::text AS email, u.password_hash,
                       u.role::text AS role, u.org_id::text AS org_id,
                       COALESCE(o.is_demo, FALSE) AS is_demo,
                       COALESCE(o.onboarding_complete, FALSE) AS onboarding_complete,
                       COALESCE(o.onboarding_step, 0) AS onboarding_step,
                       COALESCE(u.token_version, 1) AS token_version
                FROM users u
                JOIN organizations o ON o.id = u.org_id
                WHERE u.id = :id AND u.is_active = TRUE
                """
            ),
            {"id": uid},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=401, detail="User no longer valid")

    user_row = dict(row)
    access = _token_for_db_user(user_row)
    new_refresh = await issue_refresh_token(
        session,
        user_id=uid,
        refresh_ttl_days=REFRESH_TOKEN_EXPIRE_DAYS,
    )
    return {
        "access_token": access,
        "refresh_token": new_refresh,
        "token_type": "bearer",
        "expires_in": 60 * int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")),
    }


@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordBody,
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Request password reset (always returns generic message; logs token in dev when configured)."""
    email = body.email.strip().lower()
    row = (
        await session.execute(
            text("SELECT id::text FROM users WHERE lower(email) = lower(:email) AND is_active = TRUE"),
            {"email": email},
        )
    ).scalar_one_or_none()
    if row:
        raw = await issue_reset_token(session, str(row))
        if os.getenv("CORTEX_DEBUG_RESET_LINK", "").lower() in ("1", "true", "yes"):
            logger.warning("password_reset_debug_token", email=email, token_preview=raw[:12])
    return {"message": "If an account exists for this email, reset instructions have been recorded."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordBody, session: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Complete password reset with single-use token."""
    uid = await consume_reset_token(session, body.token)
    if uid is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    new_hash = hash_password(body.new_password)
    await session.execute(
        text(
            """
            UPDATE users SET password_hash = :ph, token_version = token_version + 1, updated_at = NOW()
            WHERE id = :id
            """
        ),
        {"ph": new_hash, "id": uid},
    )
    await revoke_all_refresh_for_user(session, uid)
    await append_audit_log(
        session,
        event_type="password_reset_completed",
        entity_type="user",
        entity_id=uid,
        payload={"source": "reset_token"},
    )
    return {"message": "Password updated. Sign in with your new password."}


@router.put("/password")
async def change_password(
    body: ChangePasswordBody,
    current_user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Change password (invalidates other sessions via token_version bump + refresh revoke)."""
    if current_user.get("auth_kind") == "api_key":
        raise HTTPException(status_code=403, detail="Not available for API key principal")
    uid = str(current_user.get("user_id") or current_user.get("sub") or "")
    if not uid or uid.startswith("apikey:"):
        raise HTTPException(status_code=400, detail="Unsupported account")

    row = (
        await session.execute(
            text(
                "SELECT password_hash::text FROM users WHERE id = :id AND is_active = TRUE"
            ),
            {"id": uid},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(body.current_password, str(row["password_hash"])):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    await session.execute(
        text(
            """
            UPDATE users SET password_hash = :ph, token_version = token_version + 1, updated_at = NOW()
            WHERE id = :id
            """
        ),
        {"ph": hash_password(body.new_password), "id": uid},
    )
    await revoke_all_refresh_for_user(session, uid)
    await append_audit_log(
        session,
        event_type="password_changed",
        entity_type="user",
        entity_id=uid,
        payload={},
    )
    return {"message": "Password updated. Obtain a new access token by signing in again or using refresh."}


@router.post("/service-keys")
async def create_service_key(
    body: ServiceKeyCreateBody,
    current_user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Create a service API key for the caller's organisation (admin only). Raw key is shown once."""
    from core.rbac import Permission, user_has_permission

    if not user_has_permission(current_user, Permission.manage_api_keys):
        raise HTTPException(status_code=403, detail="Permission denied: manage_api_keys")
    org_id = str(current_user.get("org_id") or "")
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing organisation")

    raw = f"{API_KEY_PREFIX}{secrets.token_hex(32)}"
    digest = _hash_opaque(raw)
    prefix = raw[:16]
    kid = str(uuid.uuid4())
    await session.execute(
        text(
            """
            INSERT INTO service_api_keys (id, org_id, key_prefix, key_hash, label)
            VALUES (CAST(:id AS uuid), :org, :prefix, :kh, :label)
            """
        ),
        {"id": kid, "org": org_id, "prefix": prefix, "kh": digest, "label": body.label.strip() or "integration"},
    )
    await append_audit_log(
        session,
        event_type="service_api_key_created",
        entity_type="service_api_key",
        entity_id=kid,
        payload={"org_id": org_id, "label": body.label},
    )
    logger.info("service_api_key_issued", org_id=org_id, key_id=kid)
    return {
        "api_key": raw,
        "key_prefix": prefix,
        "id": kid,
        "message": "Store this key securely; it cannot be retrieved again.",
    }


@router.put("/onboarding/step")
async def update_onboarding_step(
    payload: OnboardingStepBody,
    current_user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Persist onboarding wizard progress for the caller's organisation."""
    org_id = str(current_user.get("org_id") or "")
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing organisation")

    step = payload.step
    data = payload.data or {}
    updates: dict[str, Any] = {"onboarding_step": step}

    if step == 1 and data:
        updates["entity_structure"] = str(data.get("entity_structure", "single"))

    if step == 2 and data:
        fw = data.get("frameworks") or []
        if isinstance(fw, list):
            updates["selected_frameworks"] = [str(x) for x in fw]

    if step == 3:
        updates["onboarding_complete"] = True

    # Single static statement; NULL binds skip columns via COALESCE (Bandit B608 / injection-safe).
    stmt = text(
        """
        UPDATE organizations SET
          updated_at = NOW(),
          onboarding_step = COALESCE(:onboarding_step, onboarding_step),
          entity_structure = COALESCE(:entity_structure, entity_structure),
          selected_frameworks = COALESCE(:selected_frameworks, selected_frameworks),
          onboarding_complete = COALESCE(:onboarding_complete, onboarding_complete)
        WHERE id = :org_id
        """
    )
    params = {
        "org_id": org_id,
        "onboarding_step": updates["onboarding_step"],
        "entity_structure": updates.get("entity_structure"),
        "selected_frameworks": updates.get("selected_frameworks"),
        "onboarding_complete": updates.get("onboarding_complete"),
    }

    async def _execute_update() -> None:
        await session.execute(stmt, params)

    try:
        await _execute_update()
    except SQLAlchemyError as first:
        await session.rollback()
        logger.warning("onboarding_update_retry_schema", org_id=org_id, error=str(first))
        await ensure_org_onboarding_schema()
        try:
            await _execute_update()
        except SQLAlchemyError as e:
            await session.rollback()
            logger.warning("onboarding_update_db_failed", org_id=org_id, error=str(e))
            raise HTTPException(
                status_code=503,
                detail="Onboarding update unavailable — database unreachable or schema mismatch",
            ) from e

    return {"step": step, "org_id": org_id, "updated": updates}


@router.get("/me")
async def get_me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return current_user
