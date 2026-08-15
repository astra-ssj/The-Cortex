# api/audit.py — read side of the append-only audit_log hash chain.
#
# The Evidence Vault UI already did real in-browser SHA-256, but over a hardcoded
# RAW_SEED array, so the cryptography was theatre: verifying a constant against a
# hash of that same constant proves nothing. `append_audit_log` has been writing a
# genuine prev_hash chain since migration 016 and nothing could read it back.
#
# Two things make browser-side verification meaningful here:
#
#   1. `hash_material` is the exact preimage `core.audit_fabric._compute_hash`
#      hashed, rebuilt from the stored columns. The browser hashes it and compares
#      against the stored `hash`. Reconstructing Python's json.dumps(sort_keys=True)
#      in JavaScript would be a second, subtly divergent canonicaliser, and a
#      false "tampered" verdict is worse than none — so the canonical form is
#      produced once, server-side, by the same function that writes it.
#   2. The chain link is checked client-side without trusting us at all: each row's
#      prev_hash must equal the previous row's hash. Editing any row in the middle
#      breaks every hash after it, which is the property the vault claims.
#
# audit_log has no RLS policy (016 covers organizations/assessment_results/findings
# only), so org scoping is an explicit predicate here. Rows with a NULL org_id are
# system events and are never returned to a tenant.

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from core.audit_fabric import canonical_payload_json, compute_entry_hash
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, bind_scoped_org, resolve_scoped_org_id

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])

# The genesis link. append_audit_log stores NULL for the first row; the UI needs a
# concrete 64-hex value to render and to seed its walk.
GENESIS_HASH = "0" * 64

_SELECT = """
    SELECT id, org_id, actor, action, resource_type, resource_id,
           payload, hash, prev_hash, created_at
    FROM audit_log
"""


def _payload_dict(value: Any) -> dict[str, Any]:
    """jsonb arrives as dict or as text depending on the driver's codec."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return {}
    return value if isinstance(value, dict) else {}


def _row_to_entry(row: Any) -> dict[str, Any]:
    payload = _payload_dict(row["payload"])
    action = str(row["action"] or "")
    resource_type = row["resource_type"]
    resource_id = row["resource_id"]
    prev_hash = row["prev_hash"]
    payload_json = canonical_payload_json(payload)

    return {
        "id": str(row["id"]),
        "org_id": row["org_id"],
        "actor": row["actor"] or "system",
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "payload": payload,
        "hash": str(row["hash"]),
        "prev_hash": prev_hash or GENESIS_HASH,
        "created_at": row["created_at"].isoformat()
        if hasattr(row["created_at"], "isoformat")
        else str(row["created_at"]),
        # Preimage, in the same field order core.audit_fabric._compute_hash joins.
        "hash_material": "|".join(
            [
                action,
                str(resource_type or ""),
                str(resource_id or ""),
                payload_json,
                str(prev_hash or ""),
            ]
        ),
    }


async def _bind(
    db: AsyncSession, current_user: dict[str, Any], org_id: Optional[str]
) -> str:
    scope = (org_id or current_user.get("org_id") or DEMO_ORG_ID).strip()
    effective = resolve_scoped_org_id(current_user, scope)
    return await bind_scoped_org(db, current_user, effective)


@router.get("", summary="Read the audit log hash chain")
async def list_audit_entries(
    action_prefix: Optional[str] = Query(
        None, description="Match action by prefix, e.g. 'learning.' for loop events"
    ),
    resource_id: Optional[str] = None,
    org_id: Optional[str] = Query(None, description="Scoped organisation id (demo toggle)"),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Audit entries for the scoped organisation, newest first.

    ``chain_verified`` is the server's own walk of the returned window: prev_hash
    links, plus each row's hash recomputed from its stored columns. It is a
    convenience and a self-check, not the basis of the UI's claim — the browser
    repeats both independently.
    """
    effective = await _bind(db, current_user, org_id)

    filters: dict[str, Any] = {
        "org_id": effective,
        "action_prefix": (action_prefix or "").strip() or None,
        "resource_id": (resource_id or "").strip() or None,
    }
    where = """
        WHERE org_id = :org_id
          AND (CAST(:action_prefix AS text) IS NULL
               OR action LIKE CAST(:action_prefix AS text) || '%')
          AND (CAST(:resource_id AS text) IS NULL
               OR resource_id = CAST(:resource_id AS text))
    """

    total = (
        await db.execute(text(f"SELECT count(*) FROM audit_log {where}"), filters)  # noqa: S608
    ).scalar()

    rows = (
        (
            await db.execute(
                text(  # noqa: S608
                    f"""
                    {_SELECT} {where}
                    ORDER BY created_at DESC, id DESC
                    LIMIT :limit OFFSET :offset
                    """
                ),
                {**filters, "limit": limit, "offset": offset},
            )
        )
        .mappings()
        .all()
    )

    entries = _order_newest_first_by_chain([_row_to_entry(r) for r in rows])

    return {
        "items": entries,
        "total": int(total or 0),
        "offset": offset,
        "limit": limit,
        "genesis_hash": GENESIS_HASH,
        "chain_verified": _verify_window(entries),
    }


def _order_newest_first_by_chain(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Put the page in prev_hash order, newest first.

    Same-transaction inserts share a created_at, and audit_log ids are UUIDs, so
    ``ORDER BY created_at DESC, id DESC`` is not chain order. The vault (and the
    tests) reverse the list and check adjacent prev_hash links — a UUID shuffle
    looks like tampering.
    """
    if len(entries) <= 1:
        return entries
    by_hash = {entry["hash"]: entry for entry in entries}
    referenced = {entry["prev_hash"] for entry in entries}
    heads = [entry for entry in entries if entry["hash"] not in referenced]
    if len(heads) != 1:
        return entries
    ordered: list[dict[str, Any]] = []
    seen: set[str] = set()
    current: dict[str, Any] | None = heads[0]
    while current is not None and current["hash"] not in seen:
        ordered.append(current)
        seen.add(current["hash"])
        current = by_hash.get(current["prev_hash"])
    return ordered if len(ordered) == len(entries) else entries


def _verify_window(entries: list[dict[str, Any]]) -> bool:
    """
    Recompute each hash and check the prev_hash links across one page.

    Entries arrive newest-first, so this walks in reverse. A window that does not
    start at the true chain head cannot have its first prev_hash checked against
    anything, which is why only the links *within* the window are asserted.
    """
    oldest_first = list(reversed(entries))
    for index, entry in enumerate(oldest_first):
        recomputed = compute_entry_hash(
            action=entry["action"],
            resource_type=entry["resource_type"],
            resource_id=entry["resource_id"],
            payload_json=canonical_payload_json(entry["payload"]),
            prev_hash=None if entry["prev_hash"] == GENESIS_HASH else entry["prev_hash"],
        )
        if recomputed != entry["hash"]:
            logger.warning("audit_chain_hash_mismatch", entry_id=entry["id"])
            return False
        if index > 0 and entry["prev_hash"] != oldest_first[index - 1]["hash"]:
            logger.warning("audit_chain_link_broken", entry_id=entry["id"])
            return False
    return True


@router.get("/{entry_id}", summary="Get one audit entry")
async def get_audit_entry(
    entry_id: str,
    org_id: Optional[str] = Query(None, description="Scoped organisation id (demo toggle)"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    effective = await _bind(db, current_user, org_id)
    try:
        # Cast a malformed id to a 404 rather than letting Postgres raise a 500.
        parsed = str(uuid.UUID(entry_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Audit entry not found") from None
    row = (
        (
            await db.execute(
                text(f"{_SELECT} WHERE id = CAST(:id AS uuid) AND org_id = :org_id"),  # noqa: S608
                {"id": parsed, "org_id": effective},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Audit entry not found")
    return _row_to_entry(row)
