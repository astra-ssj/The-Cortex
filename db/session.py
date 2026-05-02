# db/session.py — Async SQLAlchemy engine and session. DATABASE_URL from env.

from __future__ import annotations

import os
from typing import AsyncGenerator

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://localhost/cortex",
).replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(DATABASE_URL, echo=False)
async_session_factory = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
)

logger = structlog.get_logger()


async def database_ready() -> bool:
    """True if Postgres accepts connections (for readiness probes)."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


# Mirrors services/graphjin/migrations/004_multi_tenancy.sql — heals DBs created before that migration.
_ORG_ONBOARDING_ALTER_STATEMENTS: tuple[str, ...] = (
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE",
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0",
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS entity_structure TEXT DEFAULT 'single'",
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS selected_frameworks TEXT[] DEFAULT '{}'",
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE",
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'system'",
)


async def ensure_org_onboarding_schema() -> None:
    """Apply onboarding columns if missing (idempotent). Logs and continues if DB is unreachable."""
    try:
        async with engine.begin() as conn:
            for stmt in _ORG_ONBOARDING_ALTER_STATEMENTS:
                await conn.execute(text(stmt))
    except Exception as e:
        logger.warning("org_onboarding_schema_guard_failed", error=str(e))


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Verify connectivity; schema is applied via init.sql."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
