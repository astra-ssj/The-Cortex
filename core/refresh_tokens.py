# core/refresh_tokens.py — Opaque refresh token persistence.

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth_opaque import hash_opaque_token

logger = structlog.get_logger()


def _raw_refresh_token() -> str:
    return secrets.token_urlsafe(48)


async def issue_refresh_token(
    session: AsyncSession,
    *,
    user_id: str,
    refresh_ttl_days: int,
) -> str:
    raw = _raw_refresh_token()
    th = hash_opaque_token(raw)
    exp = datetime.now(timezone.utc) + timedelta(days=refresh_ttl_days)
    await session.execute(
        text(
            """
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES (:uid, :th, :exp)
            """
        ),
        {"uid": user_id, "th": th, "exp": exp},
    )
    return raw


async def take_refresh_token(session: AsyncSession, raw: str) -> str | None:
    """
    Atomically revoke a valid refresh token row and return user_id.
    One-time use (rotation): caller issues new refresh after success.
    """
    th = hash_opaque_token(raw.strip())
    r = await session.execute(
        text(
            """
            UPDATE refresh_tokens
            SET revoked_at = NOW()
            WHERE token_hash = :th
              AND revoked_at IS NULL
              AND expires_at > NOW()
            RETURNING user_id::text
            """
        ),
        {"th": th},
    )
    uid = r.scalar_one_or_none()
    return str(uid) if uid else None


async def revoke_all_refresh_for_user(session: AsyncSession, user_id: str) -> None:
    await session.execute(
        text(
            """
            UPDATE refresh_tokens
            SET revoked_at = COALESCE(revoked_at, NOW())
            WHERE user_id = :uid AND revoked_at IS NULL
            """
        ),
        {"uid": user_id},
    )
