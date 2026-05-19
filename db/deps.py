# db/deps.py — Shared FastAPI DB session dependencies (core + api).

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from db.session import async_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_db_login_session() -> AsyncGenerator[AsyncSession, None]:
    """Read-only DB use (login probe). Always rollback."""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.rollback()
