# core/audit_fabric.py — Append-only audit_log writes; transactional helper for same-session mutations.

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import database_ready, engine

logger = structlog.get_logger()


def _entry_payload_json(payload: dict[str, Any] | None) -> str:
    return json.dumps(payload or {}, default=str)


async def append_audit_log(
    session: AsyncSession,
    *,
    event_type: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """Insert one audit row using the caller's session so it commits with the same transaction."""
    await session.execute(
        text(
            """
            INSERT INTO audit_log (event_type, entity_type, entity_id, payload)
            VALUES (:event_type, :entity_type, :entity_id, CAST(:payload AS jsonb))
            """
        ),
        {
            "event_type": event_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "payload": _entry_payload_json(payload),
        },
    )


async def _persist_audit_entry_standalone(entry: dict[str, Any]) -> None:
    if not await database_ready():
        logger.warning("audit_fabric_db_unreachable", event_type=entry.get("event_type"))
        return
    try:
        payload_json = _entry_payload_json(entry.get("payload"))
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    """
                    INSERT INTO audit_log (event_type, entity_type, entity_id, payload)
                    VALUES (:event_type, :entity_type, :entity_id, CAST(:payload AS jsonb))
                    """
                ),
                {
                    "event_type": entry["event_type"],
                    "entity_type": entry["entity_type"],
                    "entity_id": entry["entity_id"],
                    "payload": payload_json,
                },
            )
    except Exception as e:
        logger.warning(
            "audit_fabric_persist_failed",
            error=str(e),
            event_type=entry.get("event_type"),
        )


class AuditFabric:
    """Append-only audit fabric. Never UPDATE or DELETE."""

    def log(
        self,
        event_type: str,
        entity_type: str | None = None,
        entity_id: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        """Standalone audit insert in its own transaction (for reads/connectors without an open DB session)."""
        entry = {
            "event_type": event_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "payload": payload or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.info("audit_fabric_log", event_type=event_type, entity_id=entity_id)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning("audit_fabric_no_event_loop", event_type=event_type)
            return
        loop.create_task(_persist_audit_entry_standalone(entry))

    async def total_events_async(self) -> int:
        if not await database_ready():
            return 0
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT COUNT(*) FROM audit_log"))
            n_db = result.scalar_one()
        return int(n_db)

    async def last_event_at_async(self) -> str | None:
        if not await database_ready():
            return None
        async with engine.connect() as conn:
            row = (
                await conn.execute(text("SELECT created_at FROM audit_log ORDER BY id DESC LIMIT 1"))
            ).first()
            if row is None:
                return None
            ts = row[0]
            return ts.isoformat() if hasattr(ts, "isoformat") else str(ts)


audit_fabric = AuditFabric()
