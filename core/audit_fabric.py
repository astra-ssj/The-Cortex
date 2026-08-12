# core/audit_fabric.py — Durable append-only audit_log with hash chain (same-txn writes).

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import database_ready, engine

logger = structlog.get_logger()

# Advisory lock key — serialises hash-chain tail reads across connections.
_AUDIT_CHAIN_LOCK_KEY = 872_014_01


def _entry_payload_json(payload: dict[str, Any] | None) -> str:
    return json.dumps(payload or {}, default=str, sort_keys=True)


def _compute_hash(
    *,
    action: str,
    resource_type: str | None,
    resource_id: str | None,
    payload_json: str,
    prev_hash: str | None,
) -> str:
    material = "|".join(
        [
            action or "",
            resource_type or "",
            resource_id or "",
            payload_json,
            prev_hash or "",
        ]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


async def _result_first(result: Any) -> Any:
    """Compat helper: real Result.first() vs AsyncMock returning awaitables."""
    first = getattr(result, "first", None)
    if first is None:
        return None
    row = first() if callable(first) else first
    if inspect.isawaitable(row):
        row = await row
    return row


class AuditFabric:
    """
    Append-only audit fabric backed by Postgres.

    Tail hash is loaded from the table on startup (not an empty in-memory deque)
    so the chain continues across process restarts. Never UPDATE or DELETE.
    """

    def __init__(self) -> None:
        self._tail_hash: str | None = None
        self._tail_loaded: bool = False
        self._lock = asyncio.Lock()

    async def load_tail(self) -> None:
        """Load the latest hash from audit_log so restarts continue the chain."""
        if not await database_ready():
            self._tail_hash = None
            self._tail_loaded = True
            logger.warning("audit_fabric_tail_skipped_db_unreachable")
            return
        try:
            async with engine.connect() as conn:
                row = (
                    await conn.execute(
                        text(
                            """
                            SELECT hash FROM audit_log
                            ORDER BY created_at DESC, id DESC
                            LIMIT 1
                            """
                        )
                    )
                ).first()
                self._tail_hash = str(row[0]) if row and row[0] else None
            self._tail_loaded = True
            logger.info(
                "audit_fabric_tail_loaded",
                has_tail=bool(self._tail_hash),
            )
        except Exception as e:
            self._tail_hash = None
            self._tail_loaded = True
            logger.warning("audit_fabric_tail_load_failed", error=str(e))

    def log(
        self,
        event_type: str,
        entity_type: str | None = None,
        entity_id: str | None = None,
        payload: dict[str, Any] | None = None,
        *,
        action: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        org_id: str | None = None,
        actor: str | None = None,
    ) -> None:
        """Standalone audit insert in its own transaction (reads/connectors without an open session)."""
        resolved_action = action or event_type
        resolved_type = resource_type if resource_type is not None else entity_type
        resolved_id = resource_id if resource_id is not None else entity_id
        entry = {
            "action": resolved_action,
            "resource_type": resolved_type,
            "resource_id": resolved_id,
            "payload": payload or {},
            "org_id": org_id or (payload or {}).get("org_id"),
            "actor": actor or (payload or {}).get("actor") or "system",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.info("audit_fabric_log", action=resolved_action, resource_id=resolved_id)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning("audit_fabric_no_event_loop", action=resolved_action)
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
                await conn.execute(
                    text("SELECT created_at FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 1")
                )
            ).first()
            if row is None:
                return None
            ts = row[0]
            return ts.isoformat() if hasattr(ts, "isoformat") else str(ts)


audit_fabric = AuditFabric()


async def append_audit_log(
    session: AsyncSession,
    *,
    event_type: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    payload: dict[str, Any] | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    org_id: str | None = None,
    actor: str | None = None,
) -> str:
    """
    Insert one audit row on the caller's session (same transaction as the mutation).

    Hash-chains each row to prev_hash so tampering is detectable. Returns the new hash.
    """
    resolved_action = action or event_type
    if not resolved_action:
        raise ValueError("action or event_type is required")
    resolved_type = resource_type if resource_type is not None else entity_type
    resolved_id = resource_id if resource_id is not None else entity_id
    payload_dict = payload or {}
    resolved_org = org_id or payload_dict.get("org_id")
    resolved_actor = actor or payload_dict.get("actor") or "system"
    payload_json = _entry_payload_json(payload_dict)

    # Serialise chain extension for this transaction (SELECT FOR UPDATE needs UPDATE priv).
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:k)"),
        {"k": _AUDIT_CHAIN_LOCK_KEY},
    )
    prev_row = await _result_first(
        await session.execute(
            text(
                """
                SELECT hash FROM audit_log
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """
            )
        )
    )
    prev_hash = str(prev_row[0]) if prev_row and prev_row[0] else None
    if prev_hash is None and audit_fabric._tail_loaded:
        prev_hash = audit_fabric._tail_hash

    row_hash = _compute_hash(
        action=resolved_action,
        resource_type=resolved_type,
        resource_id=resolved_id,
        payload_json=payload_json,
        prev_hash=prev_hash,
    )

    await session.execute(
        text(
            """
            INSERT INTO audit_log (
                org_id, actor, action, resource_type, resource_id,
                payload, hash, prev_hash
            )
            VALUES (
                :org_id, :actor, :action, :resource_type, :resource_id,
                CAST(:payload AS jsonb), :hash, :prev_hash
            )
            """
        ),
        {
            "org_id": resolved_org,
            "actor": resolved_actor,
            "action": resolved_action,
            "resource_type": resolved_type,
            "resource_id": resolved_id,
            "payload": payload_json,
            "hash": row_hash,
            "prev_hash": prev_hash,
        },
    )
    audit_fabric._tail_hash = row_hash
    audit_fabric._tail_loaded = True
    return row_hash


async def _persist_audit_entry_standalone(entry: dict[str, Any]) -> None:
    if not await database_ready():
        logger.warning("audit_fabric_db_unreachable", action=entry.get("action"))
        return
    try:
        async with engine.begin() as conn:
            # engine.begin() yields AsyncConnection; wrap via raw SQL only.
            session_proxy = conn
            await session_proxy.execute(
                text("SELECT pg_advisory_xact_lock(:k)"),
                {"k": _AUDIT_CHAIN_LOCK_KEY},
            )
            prev_row = await _result_first(
                await session_proxy.execute(
                    text(
                        """
                        SELECT hash FROM audit_log
                        ORDER BY created_at DESC, id DESC
                        LIMIT 1
                        """
                    )
                )
            )
            prev_hash = str(prev_row[0]) if prev_row and prev_row[0] else None
            payload_json = _entry_payload_json(entry.get("payload"))
            action = str(entry.get("action") or "")
            resource_type = entry.get("resource_type")
            resource_id = entry.get("resource_id")
            row_hash = _compute_hash(
                action=action,
                resource_type=str(resource_type) if resource_type is not None else None,
                resource_id=str(resource_id) if resource_id is not None else None,
                payload_json=payload_json,
                prev_hash=prev_hash,
            )
            await session_proxy.execute(
                text(
                    """
                    INSERT INTO audit_log (
                        org_id, actor, action, resource_type, resource_id,
                        payload, hash, prev_hash
                    )
                    VALUES (
                        :org_id, :actor, :action, :resource_type, :resource_id,
                        CAST(:payload AS jsonb), :hash, :prev_hash
                    )
                    """
                ),
                {
                    "org_id": entry.get("org_id"),
                    "actor": entry.get("actor") or "system",
                    "action": action,
                    "resource_type": resource_type,
                    "resource_id": resource_id,
                    "payload": payload_json,
                    "hash": row_hash,
                    "prev_hash": prev_hash,
                },
            )
            audit_fabric._tail_hash = row_hash
            audit_fabric._tail_loaded = True
    except Exception as e:
        logger.warning(
            "audit_fabric_persist_failed",
            error=str(e),
            action=entry.get("action"),
        )
