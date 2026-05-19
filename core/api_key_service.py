# core/api_key_service.py — Service-to-service API keys (X-API-Key).

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth_opaque import hash_opaque_token

logger = structlog.get_logger()

API_KEY_PREFIX = "crtx_sk_"


async def resolve_api_key_principal(session: AsyncSession, raw_key: str) -> dict[str, Any]:
    """Validate ``X-API-Key`` and return a user-shaped principal scoped to the key's organisation."""
    key = (raw_key or "").strip()
    if not key.startswith(API_KEY_PREFIX) or len(key) < 20:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        ) from None

    digest = hash_opaque_token(key)
    r = await session.execute(
        text(
            """
            SELECT id::text, org_id::text, label
            FROM service_api_keys
            WHERE key_hash = :h AND revoked_at IS NULL
            """
        ),
        {"h": digest},
    )
    row = r.mappings().first()
    if row is None:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key",
        ) from None

    kid = str(row["id"])
    org_id = str(row["org_id"])
    label = str(row.get("label") or "service")

    await session.execute(
        text("UPDATE service_api_keys SET last_used_at = NOW() WHERE id = CAST(:id AS uuid)"),
        {"id": kid},
    )

    logger.info("api_key_auth", org_id=org_id, key_id=kid)
    return {
        "sub": f"apikey:{kid}",
        "user_id": f"apikey:{kid}",
        "email": "",
        "role": "service",
        "org_id": org_id,
        "name": label,
        "entity": org_id,
        "is_demo": False,
        "onboarding_complete": True,
        "onboarding_step": 5,
        "auth_kind": "api_key",
    }
