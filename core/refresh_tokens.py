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


async def load_refresh_token_user_id(session: AsyncSession, raw: str) -> str | None:
    """Resolve a currently usable token without consuming it."""
    th = hash_opaque_token(raw.strip())
    r = await session.execute(
        text(
            """
            SELECT user_id::text
            FROM refresh_tokens
            WHERE token_hash = :th
              AND revoked_at IS NULL
              AND expires_at > NOW()
            """
        ),
        {"th": th},
    )
    uid = r.scalar_one_or_none()
    return str(uid) if uid else None


async def take_refresh_token(
    session: AsyncSession,
    raw: str,
    *,
    user_id: str | None = None,
) -> str | None:
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
              AND (CAST(:uid AS text) IS NULL OR user_id = CAST(:uid AS text))
              AND revoked_at IS NULL
              AND expires_at > NOW()
            RETURNING user_id::text
            """
        ),
        {"th": th, "uid": user_id},
    )
    uid = r.scalar_one_or_none()
    return str(uid) if uid else None


async def revoke_refresh_token_for_user(
    session: AsyncSession,
    *,
    raw: str,
    user_id: str,
) -> None:
    """Idempotently revoke one token only when it belongs to the caller."""
    th = hash_opaque_token(raw.strip())
    await session.execute(
        text(
            """
            UPDATE refresh_tokens
            SET revoked_at = COALESCE(revoked_at, NOW())
            WHERE token_hash = :th
              AND user_id = :uid
            """
        ),
        {"th": th, "uid": user_id},
    )


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
