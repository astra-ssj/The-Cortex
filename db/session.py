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
    "postgresql+asyncpg://cortex_app@localhost/cortex",
).replace("postgresql://", "postgresql+asyncpg://", 1)

_engine_kwargs: dict = {"echo": False}
# TestClient runs many requests on one event loop; pooling asyncpg across requests causes
# "another operation is in progress" (InterfaceError). NullPool opens a fresh connection per checkout.
if os.getenv("CORTEX_TESTING") or os.getenv("PYTEST_CURRENT_TEST"):
    from sqlalchemy.pool import NullPool

    _engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)
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


# Mirrors migrations/005_multi_tenancy.sql — heals DBs created before that migration.
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


# Mirrors migrations/012_security_auth.sql — heals older volumes without that migration file.
_SECURITY_AUTH_STATEMENTS: tuple[str, ...] = (
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ NULL",
    """
    CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)",
    """
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id)",
    """
    CREATE TABLE IF NOT EXISTS service_api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ NULL,
        revoked_at TIMESTAMPTZ NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_service_api_keys_org ON service_api_keys(org_id)",
)


async def ensure_security_auth_schema() -> None:
    """Apply auth-hardening tables/columns if missing (idempotent)."""
    try:
        async with engine.begin() as conn:
            for stmt in _SECURITY_AUTH_STATEMENTS:
                await conn.execute(text(stmt))
    except Exception as e:
        logger.warning("security_auth_schema_guard_failed", error=str(e))


async def ensure_zero_trust_schema() -> None:
    """
    Apply migration 016 (RLS + append-only audit) when missing on existing volumes.

    Fresh docker-entrypoint-initdb.d installs already include 016; this heals DBs
    that were created before Phase 2 without requiring a volume wipe.
    """
    import asyncio
    import pathlib
    from urllib.parse import urlparse, unquote

    migration = (
        pathlib.Path(__file__).resolve().parent.parent
        / "migrations"
        / "016_rls_and_append_only_audit.sql"
    )
    try:
        async with engine.connect() as conn:
            has_policy = (
                await conn.execute(
                    text(
                        """
                        SELECT 1 FROM pg_policies
                        WHERE schemaname = 'public'
                          AND tablename = 'findings'
                          AND policyname = 'tenant_isolation'
                        LIMIT 1
                        """
                    )
                )
            ).first()
            has_hash = (
                await conn.execute(
                    text(
                        """
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'audit_log'
                          AND column_name = 'hash'
                        LIMIT 1
                        """
                    )
                )
            ).first()
            if has_policy and has_hash:
                return

        if not migration.is_file():
            logger.warning("zero_trust_migration_missing", path=str(migration))
            return

        def _apply() -> None:
            import psycopg2

            url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
            parsed = urlparse(url)
            conn = psycopg2.connect(
                host=parsed.hostname or "localhost",
                port=parsed.port or 5432,
                user=unquote(parsed.username or "cortex"),
                password=unquote(parsed.password or ""),
                dbname=(parsed.path or "/cortex").lstrip("/") or "cortex",
            )
            conn.autocommit = True
            try:
                with conn.cursor() as cur:
                    cur.execute(migration.read_text(encoding="utf-8"))
            finally:
                conn.close()

        await asyncio.to_thread(_apply)
        # Keep cortex_app password aligned with the app DATABASE_URL secret.
        def _sync_app_role_password() -> None:
            import psycopg2
            from urllib.parse import urlparse, unquote

            url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
            parsed = urlparse(url)
            password = unquote(parsed.password or "")
            if not password:
                return
            # Connect as migration owner (cortex / superuser) when possible.
            admin_user = os.environ.get("PGUSER", "cortex")
            admin_password = os.environ.get("PGPASSWORD", password)
            conn = psycopg2.connect(
                host=parsed.hostname or "localhost",
                port=parsed.port or 5432,
                user=admin_user,
                password=admin_password,
                dbname=(parsed.path or "/cortex").lstrip("/") or "cortex",
            )
            conn.autocommit = True
            try:
                with conn.cursor() as cur:
                    cur.execute("ALTER ROLE cortex_app WITH PASSWORD %s", (password,))
            finally:
                conn.close()

        try:
            await asyncio.to_thread(_sync_app_role_password)
        except Exception as e:
            logger.warning("cortex_app_password_sync_failed", error=str(e))
        logger.info("zero_trust_schema_applied", path=migration.name)
    except Exception as e:
        logger.warning("zero_trust_schema_guard_failed", error=str(e))


async def ensure_learning_loop_schema() -> None:
    """
    Apply migration 017 (scenario_sessions + RLS) when missing on existing volumes.

    Fresh docker-entrypoint-initdb.d installs already include 017; this heals DBs
    that were created before Learning Loop v1 without requiring a volume wipe.
    """
    import asyncio
    import pathlib
    from urllib.parse import urlparse, unquote

    migration = (
        pathlib.Path(__file__).resolve().parent.parent
        / "migrations"
        / "017_learning_loop.sql"
    )
    try:
        async with engine.connect() as conn:
            has_table = (
                await conn.execute(
                    text(
                        """
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_name = 'scenario_sessions'
                        LIMIT 1
                        """
                    )
                )
            ).first()
            has_policy = (
                await conn.execute(
                    text(
                        """
                        SELECT 1 FROM pg_policies
                        WHERE schemaname = 'public'
                          AND tablename = 'scenario_sessions'
                          AND policyname = 'tenant_isolation'
                        LIMIT 1
                        """
                    )
                )
            ).first()
            if has_table and has_policy:
                return

        if not migration.is_file():
            logger.warning("learning_loop_migration_missing", path=str(migration))
            return

        def _apply() -> None:
            import psycopg2

            url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
            parsed = urlparse(url)
            # Prefer migration owner (cortex) so FORCE RLS / GRANT land correctly.
            admin_user = os.environ.get("PGUSER", unquote(parsed.username or "cortex"))
            admin_password = os.environ.get(
                "PGPASSWORD", unquote(parsed.password or "")
            )
            conn = psycopg2.connect(
                host=parsed.hostname or "localhost",
                port=parsed.port or 5432,
                user=admin_user,
                password=admin_password,
                dbname=(parsed.path or "/cortex").lstrip("/") or "cortex",
            )
            conn.autocommit = True
            try:
                with conn.cursor() as cur:
                    cur.execute(migration.read_text(encoding="utf-8"))
            finally:
                conn.close()

        await asyncio.to_thread(_apply)
        logger.info("learning_loop_schema_applied", path=migration.name)
    except Exception as e:
        logger.warning("learning_loop_schema_guard_failed", error=str(e))


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
