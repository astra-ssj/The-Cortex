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


async def ensure_org_invitations_schema() -> None:
    """Apply org invitation table if missing. DDL runs as table owner, not cortex_app."""
    import asyncio
    import pathlib
    from urllib.parse import urlparse, unquote

    try:
        async with engine.connect() as conn:
            exists = (
                await conn.execute(
                    text(
                        """
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name = 'org_invitations'
                        LIMIT 1
                        """
                    )
                )
            ).first()
        if exists:
            return

        migration = pathlib.Path(__file__).resolve().parent.parent / "migrations" / "031_org_invitations.sql"
        if not migration.is_file():
            logger.warning("org_invitations_migration_missing", path=str(migration))
            return

        def _apply() -> None:
            import psycopg2

            url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
            parsed = urlparse(url)
            admin_user = os.environ.get("PGUSER", "cortex")
            admin_password = os.environ.get("PGPASSWORD", unquote(parsed.password or ""))
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
        logger.info("org_invitations_schema_applied", path=migration.name)
    except Exception as e:
        logger.warning("org_invitations_schema_guard_failed", error=str(e))


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
    Apply learning-loop migrations when missing on existing volumes.

    017 creates scenario_sessions + RLS. 020 adds competency jsonb. 027/028 add
    and seed the per-choice competency weights that let scenarios past CX-1001
    score anything at all. 029/030 drop the demo findings and review-queue rows
    so Control Gaps and Review Queue can only show work the learner earned.
    Fresh docker-entrypoint-initdb.d installs already include all of them; this
    heals DBs created earlier without a volume wipe.
    """
    import asyncio
    import pathlib
    from urllib.parse import urlparse, unquote

    migrations_dir = pathlib.Path(__file__).resolve().parent.parent / "migrations"
    migration_017 = migrations_dir / "017_learning_loop.sql"
    migration_020 = migrations_dir / "020_competency_scores.sql"
    migration_027 = migrations_dir / "027_scenario_choice_dimension_weights.sql"
    migration_028 = migrations_dir / "028_scenario_dimension_weights_seed.sql"
    migration_029 = migrations_dir / "029_findings_from_competency.sql"
    migration_030 = migrations_dir / "030_review_queue_from_learning.sql"

    def _apply_file(path: pathlib.Path) -> None:
        import psycopg2

        url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
        parsed = urlparse(url)
        # DDL must run as table owner (cortex). DATABASE_URL is usually cortex_app,
        # which cannot ALTER scenario_sessions.
        admin_user = os.environ.get("PGUSER", "cortex")
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
                cur.execute(path.read_text(encoding="utf-8"))
        finally:
            conn.close()

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

        if not (has_table and has_policy):
            if not migration_017.is_file():
                logger.warning("learning_loop_migration_missing", path=str(migration_017))
            else:
                await asyncio.to_thread(_apply_file, migration_017)
                logger.info("learning_loop_schema_applied", path=migration_017.name)

        async with engine.connect() as conn:
            has_competency = (
                await conn.execute(
                    text(
                        """
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'scenario_sessions'
                          AND column_name = 'competency'
                        LIMIT 1
                        """
                    )
                )
            ).first()

        if not has_competency:
            if not migration_020.is_file():
                logger.warning("competency_migration_missing", path=str(migration_020))
            else:
                await asyncio.to_thread(_apply_file, migration_020)
                logger.info("competency_schema_applied", path=migration_020.name)

        # Content tables are absent on installs that never applied 019, and the
        # weight seed joins through them, so both steps are gated on the table.
        async with engine.connect() as conn:
            has_choices = (
                await conn.execute(
                    text(
                        """
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_name = 'scenario_choices'
                        LIMIT 1
                        """
                    )
                )
            ).first()
            has_weights = (
                await conn.execute(
                    text(
                        """
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'scenario_choices'
                          AND column_name = 'dimension_weights'
                        LIMIT 1
                        """
                    )
                )
            ).first()

        if has_choices and not has_weights:
            for migration in (migration_027, migration_028):
                if not migration.is_file():
                    logger.warning("dimension_weights_migration_missing", path=str(migration))
                    break
                await asyncio.to_thread(_apply_file, migration)
                logger.info("dimension_weights_schema_applied", path=migration.name)

        async with engine.connect() as conn:
            has_finding_source = (
                await conn.execute(
                    text(
                        """
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'findings'
                          AND column_name = 'source'
                        LIMIT 1
                        """
                    )
                )
            ).first()
            has_pending_table = (
                await conn.execute(
                    text(
                        """
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_name = 'human_review_pending'
                        LIMIT 1
                        """
                    )
                )
            ).first()
            demo_review = None
            if has_pending_table:
                demo_review = (
                    await conn.execute(
                        text(
                            """
                            SELECT 1 FROM human_review_pending
                            WHERE org_id = 'demo-org-001' AND id ~ '^review-[0-9]+$'
                            LIMIT 1
                            """
                        )
                    )
                ).first()

        if not has_finding_source and migration_029.is_file():
            await asyncio.to_thread(_apply_file, migration_029)
            logger.info("findings_from_competency_schema_applied", path=migration_029.name)
        if demo_review and migration_030.is_file():
            await asyncio.to_thread(_apply_file, migration_030)
            logger.info("review_queue_from_learning_schema_applied", path=migration_030.name)
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
