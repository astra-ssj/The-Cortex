# core/audit_fabric.py — Append-only audit log. Writes to audit_log (Postgres); in-memory fallback if DB fails.

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text

from db.session import database_ready, engine

logger = structlog.get_logger()

# Events that failed to persist (e.g. DB down). Counted in totals so ZTAIP status stays consistent.
_fallback_events: list[dict[str, Any]] = []


async def _persist_audit_entry(entry: dict[str, Any]) -> None:
    try:
        payload_json = json.dumps(entry["payload"], default=str)
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
        _fallback_events.append(entry)


class AuditFabric:
    """Append-only audit fabric. Never UPDATE or DELETE."""

    def log(
        self,
        event_type: str,
        entity_type: str | None = None,
        entity_id: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
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
            _fallback_events.append(entry)
            logger.warning("audit_fabric_no_event_loop", event_type=event_type)
            return
        loop.create_task(_persist_audit_entry(entry))

    async def total_events_async(self) -> int:
        n_fb = len(_fallback_events)
        if not await database_ready():
            return n_fb
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT COUNT(*) FROM audit_log"))
            n_db = result.scalar_one()
        return int(n_db) + n_fb

    async def last_event_at_async(self) -> str | None:
        db_iso: str | None = None
        if await database_ready():
            async with engine.connect() as conn:
                row = (
                    await conn.execute(
                        text("SELECT created_at FROM audit_log ORDER BY id DESC LIMIT 1")
                    )
                ).first()
                if row is not None:
                    ts = row[0]
                    db_iso = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
        fb_iso = _fallback_events[-1]["created_at"] if _fallback_events else None
        if db_iso is None:
            return fb_iso
        if fb_iso is None:
            return db_iso
        return max(db_iso, fb_iso)


audit_fabric = AuditFabric()
