# api/findings.py — Control Gaps, backed by the Postgres `findings` table.
#
# Mounted at /api/v1/findings so the route is always available on the root API.
#
# Until migration 029 this module served twelve hardcoded GDPR/NIS2 rows from an
# in-memory list while a real `findings` table sat unused since migration 007.
# Control Gaps was the most convincing screen in the product and the least real:
# a learner who finished an ISO 27001 scenario found findings about Spanish NIS2
# registration. Deleting that fixture is the point of this module.
#
# Rows now arrive from core/gaps.py, generated when a scenario session finishes
# with a competency dimension below the floor. Tenant isolation is enforced by
# RLS on `findings` (007), so every handler binds the scoped org first.

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.schemas import FindingPatchBody, PaginatedRemediationFindings
from core.audit_fabric import append_audit_log, audit_fabric
from core.gaps import GAP_SOURCE, STATUS_REMEDIATED
from core.rbac import Permission, require_permission
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, bind_scoped_org, resolve_scoped_org_id

logger = structlog.get_logger()

router = APIRouter(tags=["findings"])

# days_open is derived rather than stored: a persisted counter is stale the day
# after it is written, and an ageing figure that lies is worse than none.
_SELECT_COLUMNS = """
    id, org_id, title, framework, framework_id, control_id, control_name,
    reference, severity, status, owner, due_date, priority, entity, entity_code,
    current_state, required_state, actions, completed_actions, notes, evidence,
    controls, source, dimension, scenario_slug, session_id, learner_id,
    competency_score, confidence, created_at, updated_at, closed_at,
    closed_by_session,
    GREATEST(0, DATE_PART('day', now() - created_at))::int AS days_open
"""


def _json_list(value: Any) -> list[Any]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return []
    return list(value) if isinstance(value, list) else []


def _iso(value: Any) -> Optional[str]:
    return value.isoformat() if hasattr(value, "isoformat") else (str(value) if value else None)


def _row_to_finding(row: Any) -> dict[str, Any]:
    """Shape a findings row for the Remediation Tracker."""
    return {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "title": str(row["title"]),
        "framework": row["framework"] or "",
        "framework_id": row["framework_id"] or "",
        "control_id": row["control_id"] or "",
        "control_name": row["control_name"] or "",
        "reference": row["reference"] or "",
        "severity": str(row["severity"]),
        "status": str(row["status"]),
        "owner": row["owner"] or "Unassigned",
        "due_date": _iso(row["due_date"]),
        "priority": row["priority"] or "P2",
        "entity": row["entity"] or "",
        "entity_code": row["entity_code"] or "",
        "current_state": row["current_state"] or "",
        "required_state": row["required_state"] or "",
        "actions": _json_list(row["actions"]),
        "completed_actions": _json_list(row["completed_actions"]),
        "notes": _json_list(row["notes"]),
        "evidence": _json_list(row["evidence"]),
        "days_open": int(row["days_open"] or 0),
        "confidence": float(row["confidence"] or 1.0),
        # Provenance — what the learner has to do to close it, and why it exists.
        "source": str(row["source"] or "manual"),
        "dimension": row["dimension"],
        "scenario_slug": row["scenario_slug"],
        "session_id": str(row["session_id"]) if row["session_id"] else None,
        "learner_id": row["learner_id"],
        "competency_score": row["competency_score"],
        "controls": _json_list(row["controls"]),
        "created_at": _iso(row["created_at"]),
        "updated_at": _iso(row["updated_at"]),
        "closed_at": _iso(row["closed_at"]),
        "closed_by_session": (
            str(row["closed_by_session"]) if row["closed_by_session"] else None
        ),
    }


async def _bind(
    db: AsyncSession, current_user: dict[str, Any], org_id: Optional[str]
) -> str:
    scope = (org_id or current_user.get("org_id") or DEMO_ORG_ID).strip()
    effective = resolve_scoped_org_id(current_user, scope)
    return await bind_scoped_org(db, current_user, effective)


async def _fetch(db: AsyncSession, finding_id: str) -> Optional[Any]:
    result = await db.execute(
        text(f"SELECT {_SELECT_COLUMNS} FROM findings WHERE id = :id"),  # nosec B608
        {"id": finding_id},
    )
    return result.mappings().first()


async def attach_evidence_to_finding(
    db: AsyncSession,
    finding_id: str,
    *,
    evidence_id: str,
    title: str,
    document_id: str | None = None,
) -> bool:
    """
    Append a graph evidence reference to a finding, idempotently.

    Deduplicates on evidence id inside the JSONB array so a repeated link does
    not double-count evidence supporting the same gap.
    """
    row = await _fetch(db, finding_id)
    if row is None:
        return False
    items = _json_list(row["evidence"])
    if any(str(e.get("id")) == evidence_id for e in items if isinstance(e, dict)):
        return True
    entry: dict[str, Any] = {
        "id": evidence_id,
        "title": title,
        "linked_at": datetime.now(timezone.utc).isoformat(),
    }
    if document_id:
        entry["document_id"] = document_id
    items.append(entry)
    await db.execute(
        text(
            """
            UPDATE findings
            SET evidence = CAST(:evidence AS jsonb), updated_at = now()
            WHERE id = :id
            """
        ),
        {"id": finding_id, "evidence": json.dumps(items)},
    )
    return True


@router.get("", summary="List control gaps")
async def list_findings(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    framework_id: Optional[str] = None,
    entity: Optional[str] = None,
    dimension: Optional[str] = Query(None, description="Competency dimension that raised the gap"),
    scenario_slug: Optional[str] = Query(None, description="Scenario that produced the gap"),
    source: Optional[str] = Query(None, description="'competency' or 'manual'"),
    org_id: Optional[str] = Query(None, description="Scoped organisation id (demo toggle)"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaginatedRemediationFindings:
    """Control gaps for the scoped organisation, newest and most severe first."""
    await _bind(db, current_user, org_id)

    filters = {
        "status": (status or "").strip() or None,
        "severity": (severity or "").strip() or None,
        "framework_id": (framework_id or "").strip() or None,
        "entity_code": (entity or "").strip() or None,
        "dimension": (dimension or "").strip() or None,
        "scenario_slug": (scenario_slug or "").strip() or None,
        "source": (source or "").strip() or None,
    }

    # Every filter is applied as "parameter IS NULL OR column = parameter" so the
    # statement stays a single static string with no interpolated user input. The
    # explicit casts are required: asyncpg cannot infer a parameter's type from a
    # bare `$1 IS NULL` and raises AmbiguousParameterError without them.
    where = """
        WHERE (CAST(:status AS text) IS NULL OR status = CAST(:status AS text))
          AND (CAST(:severity AS text) IS NULL OR severity = CAST(:severity AS text))
          AND (CAST(:framework_id AS text) IS NULL OR framework_id = CAST(:framework_id AS text))
          AND (CAST(:entity_code AS text) IS NULL OR entity_code = CAST(:entity_code AS text))
          AND (CAST(:dimension AS text) IS NULL OR dimension = CAST(:dimension AS text))
          AND (CAST(:scenario_slug AS text) IS NULL OR scenario_slug = CAST(:scenario_slug AS text))
          AND (CAST(:source AS text) IS NULL OR source = CAST(:source AS text))
    """

    total = (
        await db.execute(text(f"SELECT count(*) FROM findings {where}"), filters)  # nosec B608
    ).scalar()

    rows = (
        await db.execute(
            text(f"SELECT {_SELECT_COLUMNS} FROM findings {where} ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, created_at DESC LIMIT :limit OFFSET :offset"),  # nosec B608
            {**filters, "limit": limit, "offset": offset},
        )
    ).mappings().all()

    return PaginatedRemediationFindings(
        items=[_row_to_finding(r) for r in rows],
        total=int(total or 0),
        offset=offset,
        limit=limit,
    )


@router.get("/{finding_id}", summary="Get control gap by id")
async def get_finding(
    finding_id: str,
    org_id: Optional[str] = Query(None, description="Scoped organisation id (demo toggle)"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await _bind(db, current_user, org_id)
    row = await _fetch(db, finding_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return _row_to_finding(row)


@router.patch("/{finding_id}", summary="Update control gap")
async def update_finding(
    finding_id: str,
    body: FindingPatchBody,
    org_id: Optional[str] = Query(None, description="Scoped organisation id (demo toggle)"),
    current_user: dict = Depends(require_permission(Permission.edit_findings)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Partial update: status, severity, owner, due_date, priority, notes, completed_actions.

    A competency-derived gap cannot be marked remediated by hand. It closes when
    the learner retakes the scenario that produced it and lifts the dimension back
    over the floor — see core/gaps.reconcile_gaps_for_session. Allowing a manual
    close here would make the whole competency claim self-certified.
    """
    effective = await _bind(db, current_user, org_id)
    row = await _fetch(db, finding_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Finding not found")

    patch = body.model_dump(exclude_unset=True)
    before = {k: row[k] for k in ("status", "owner", "due_date")}
    requested_status = str(patch["status"]).strip() if patch.get("status") else None

    if (
        requested_status == STATUS_REMEDIATED
        and str(row["source"] or "") == GAP_SOURCE
    ):
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=(
                "This gap was raised by a competency score and cannot be closed manually. "
                f"Retake '{row['scenario_slug']}' and lift {row['dimension']} "
                "back over the competency floor."
            ),
        )

    notes = _json_list(row["notes"])
    if isinstance(patch.get("notes"), list):
        notes = list(patch["notes"])
    elif patch.get("note_append"):
        notes.append(
            {
                "text": str(patch["note_append"]),
                "timestamp": patch.get("note_timestamp")
                or datetime.now(timezone.utc).isoformat(),
            }
        )

    completed = _json_list(row["completed_actions"])
    if isinstance(patch.get("completed_actions"), list):
        completed = [int(x) for x in patch["completed_actions"]]

    params = {
        "id": finding_id,
        "status": requested_status,
        "severity": str(patch["severity"]).strip() if patch.get("severity") else None,
        "owner": str(patch["owner"]).strip() if patch.get("owner") else None,
        "due_date": str(patch["due_date"]).strip() if patch.get("due_date") else None,
        "priority": str(patch["priority"]).strip() if patch.get("priority") else None,
        "notes": json.dumps(notes),
        "completed_actions": json.dumps(completed),
    }
    await db.execute(
        text(
            """
            UPDATE findings
            SET status            = COALESCE(:status, status),
                severity          = COALESCE(:severity, severity),
                owner             = COALESCE(:owner, owner),
                due_date          = COALESCE(CAST(:due_date AS date), due_date),
                priority          = COALESCE(:priority, priority),
                notes             = CAST(:notes AS jsonb),
                completed_actions = CAST(:completed_actions AS jsonb),
                updated_at        = now()
            WHERE id = :id
            """
        ),
        params,
    )

    updated = await _fetch(db, finding_id)
    if updated is None:
        raise HTTPException(status_code=404, detail="Finding not found")

    after = {k: updated[k] for k in ("status", "owner", "due_date")}
    await append_audit_log(
        db,
        event_type="finding.update",
        entity_type="finding",
        entity_id=finding_id,
        org_id=effective,
        actor=str(current_user.get("sub") or current_user.get("email") or "anonymous"),
        payload={"before": {k: _iso(v) or v for k, v in before.items()}, "after": {k: _iso(v) or v for k, v in after.items()}},
    )
    audit_fabric.log(
        "finding_updated",
        entity_type="finding",
        entity_id=finding_id,
        payload={"before": str(before), "after": str(after)},
    )
    logger.info("finding_updated", finding_id=finding_id, status=updated["status"])
    return _row_to_finding(updated)
