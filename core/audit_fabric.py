# core/audit_fabric.py — Append-only audit log. Consequential actions logged before AND after.

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog

logger = structlog.get_logger()

# In-memory store for demo; production uses append-only DB (audit_log table).
_events: list[dict[str, Any]] = []


class AuditFabric:
    """Append-only audit fabric. Never UPDATE or DELETE."""

    def log(self, event_type: str, entity_type: str | None = None, entity_id: str | None = None, payload: dict[str, Any] | None = None) -> None:
        entry = {
            "event_type": event_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "payload": payload or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        _events.append(entry)
        logger.info("audit_fabric_log", event_type=event_type, entity_id=entity_id)

    def total_events(self) -> int:
        return len(_events)

    def last_event_at(self) -> str | None:
        if not _events:
            return None
        return _events[-1].get("created_at")


# Module-level instance (per .cursorrules).
audit_fabric = AuditFabric()
