# core/password_reset.py — Single-use password reset tokens.

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth_opaque import hash_opaque_token

logger = structlog.get_logger()


async def issue_reset_token(session: AsyncSession, user_id: str, ttl_hours: int = 1) -> str:
    """Invalidate prior unused tokens for user and insert a new reset token; return raw secret."""
    await session.execute(
        text("DELETE FROM password_reset_tokens WHERE user_id = :uid AND used_at IS NULL"),
        {"uid": user_id},
    )
    raw = secrets.token_urlsafe(32)
    th = hash_opaque_token(raw)
    exp = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)
    await session.execute(
        text(
            """
            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
            VALUES (:uid, :th, :exp)
            """
        ),
        {"uid": user_id, "th": th, "exp": exp},
    )
    return raw


async def consume_reset_token(session: AsyncSession, raw: str) -> str | None:
    """Mark token used and return user_id if valid."""
    th = hash_opaque_token(raw.strip())
    r = await session.execute(
        text(
            """
            SELECT id, user_id::text, expires_at, used_at
            FROM password_reset_tokens
            WHERE token_hash = :th
            """
        ),
        {"th": th},
    )
    row = r.mappings().first()
    if row is None or row["used_at"] is not None:
        return None
    exp: datetime = row["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        return None
    uid = str(row["user_id"])
    await session.execute(
        text("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = :id"),
        {"id": row["id"]},
    )
    return uid
