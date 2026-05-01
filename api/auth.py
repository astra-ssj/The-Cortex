# api/auth.py — Login (JWT), registration, onboarding step updates.

from __future__ import annotations

import os
import secrets
import uuid
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, MetaData, String, Table, bindparam, func, text, update
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.limits import limiter
from core.security import DEMO_USERS, create_access_token, get_current_user, hash_password, verify_password

logger = structlog.get_logger()

router = APIRouter(prefix="/auth", tags=["auth"])

_orgs = Table(
    "organizations",
    MetaData(),
    Column("id", String, primary_key=True),
    Column("onboarding_step", Integer),
    Column("entity_structure", String),
    Column("selected_frameworks", ARRAY(String)),
    Column("onboarding_complete", Boolean),
)

# Optional legacy demo login (plaintext compare). Disabled unless password is set via env (avoids hardcoded credentials).
_LEGACY_DEMO_USER = os.getenv("CORTEX_LEGACY_DEMO_USER", "admin").strip()
_LEGACY_DEMO_PASSWORD = os.getenv("CORTEX_LEGACY_DEMO_PASSWORD", "").strip()


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


async def _try_load_db_user(session: AsyncSession, email: str) -> dict[str, Any] | None:
    try:
        res = await session.execute(
            text(
                """
                SELECT u.id::text AS id, u.email::text AS email, u.password_hash::text AS password_hash,
                       u.role::text AS role, u.org_id::text AS org_id,
                       COALESCE(o.is_demo, FALSE) AS is_demo,
                       COALESCE(o.onboarding_complete, FALSE) AS onboarding_complete,
                       COALESCE(o.onboarding_step, 0) AS onboarding_step
                FROM users u
                JOIN organizations o ON o.id = u.org_id
                WHERE u.email = :email AND u.is_active = TRUE
                """
            ),
            {"email": email},
        )
        row = res.mappings().one_or_none()
        return dict(row) if row else None
    except (ProgrammingError, DBAPIError) as e:
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
        }
    )


@router.post("/register")
@limiter.limit("5/minute")
async def register(
    request: Request,
    payload: RegisterBody,
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create organisation + admin user; return JWT for immediate session."""
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
    except ProgrammingError as e:
        await session.rollback()
        logger.warning("register_schema_missing", error=str(e))
        raise HTTPException(
            status_code=503,
            detail="Registration unavailable — database migration may not be applied",
        ) from e

    token = create_access_token(
        {
            "sub": user_id,
            "email": str(payload.email),
            "org_id": org_id,
            "role": "ADMIN",
            "is_demo": False,
            "onboarding_complete": False,
            "onboarding_step": 1,
        }
    )

    return {
        "access_token": token,
        "token_type": "bearer",
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

    db_user = await _try_load_db_user(session, username)
    if db_user and verify_password(password, db_user["password_hash"]):
        token = _token_for_db_user(db_user)
        return {
            "access_token": token,
            "token_type": "bearer",
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

    demo = DEMO_USERS.get(username)
    if demo and verify_password(password, demo["hashed_password"]):
        token = create_access_token({"sub": username})
        return {
            "access_token": token,
            "token_type": "bearer",
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

    # Legacy demo (e.g. curl scripts): set CORTEX_LEGACY_DEMO_PASSWORD — never commit a real password.
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

    values_clause: dict[str, Any] = {"updated_at": func.now()}
    params: dict[str, Any] = {"org_id": org_id}
    if "onboarding_step" in updates:
        values_clause["onboarding_step"] = bindparam("onboarding_step")
        params["onboarding_step"] = updates["onboarding_step"]
    if "entity_structure" in updates:
        values_clause["entity_structure"] = bindparam("entity_structure")
        params["entity_structure"] = updates["entity_structure"]
    if "selected_frameworks" in updates:
        values_clause["selected_frameworks"] = bindparam("selected_frameworks")
        params["selected_frameworks"] = updates["selected_frameworks"]
    if "onboarding_complete" in updates:
        values_clause["onboarding_complete"] = bindparam("onboarding_complete")
        params["onboarding_complete"] = updates["onboarding_complete"]
    if len(values_clause) <= 1:
        raise HTTPException(status_code=400, detail="No onboarding fields to update")
    stmt = update(_orgs).where(_orgs.c.id == bindparam("org_id")).values(**values_clause)
    try:
        await session.execute(stmt, params)
    except ProgrammingError as e:
        await session.rollback()
        raise HTTPException(status_code=503, detail="Database schema not ready") from e

    return {"step": step, "org_id": org_id, "updated": updates}


@router.get("/me")
async def get_me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return current_user
