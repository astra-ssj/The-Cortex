# api/assessments.py — Frameworks and assessments API. Follow this pattern for new endpoints.
# SSE streaming for assessment runs. Human Review Queue (GDPR Art.22 / EU AI Act Art.14).

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from core.rbac import Permission, require_permission, require_permission_stream
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, bind_scoped_org, resolve_scoped_org_id
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from compliance import FrameworkId, REGISTRY, get
from compliance.models import Control, Framework

from api.schemas import (
    ApproveRequest,
    ControlOut,
    EvidenceTypeOut,
    FrameworkDetail,
    FrameworkSummary,
    OverrideRequest,
    PaginatedControls,
    PaginatedFrameworkSummaries,
    RequirementOut,
    ReviewQueueItem,
    ReviewQueueResponse,
    ReviewedItem,
)

from core.audit_fabric import append_audit_log

logger = structlog.get_logger()


def _review_actor_id(current_user: dict[str, Any]) -> str:
    """Human-review audit label: prefer email, then name, then JWT subject (bounded length)."""
    email = str(current_user.get("email") or "").strip()
    if email:
        return email[:500]
    name = str(current_user.get("name") or "").strip()
    if name:
        return name[:500]
    uid = current_user.get("user_id") or current_user.get("sub")
    if uid:
        return str(uid)[:500]
    return "reviewer"


router = APIRouter(prefix="/api/v1", tags=["frameworks", "assessments"])


def _control_to_out(c: Control) -> ControlOut:
    return ControlOut(
        id=c.id,
        name=c.name,
        domain=c.domain,
        requirements=[
            RequirementOut(
                id=r.id,
                article_ref=r.article_ref,
                description=r.description,
                evidence_types=[EvidenceTypeOut(id=e.id, name=e.name, description=e.description) for e in r.evidence_types],
            )
            for r in c.requirements
        ],
    )


def _framework_to_summary(fw: Framework) -> FrameworkSummary:
    return FrameworkSummary(
        id=fw.id,
        name=fw.name,
        version=fw.version,
        jurisdiction=fw.jurisdiction,
        purpose_tags=list(fw.purpose_tags),
        control_count=len(fw.controls),
    )


def _framework_to_detail(fw: Framework) -> FrameworkDetail:
    return FrameworkDetail(
        id=fw.id,
        name=fw.name,
        version=fw.version,
        jurisdiction=fw.jurisdiction,
        purpose_tags=list(fw.purpose_tags),
        controls=[_control_to_out(c) for c in fw.controls],
    )


@router.get("/frameworks", response_model=PaginatedFrameworkSummaries)
async def list_frameworks(
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=200, description="Page size"),
    current_user: dict = Depends(get_current_user),
) -> PaginatedFrameworkSummaries:
    """List registered frameworks with summaries (no full controls); paginated."""
    summaries = [_framework_to_summary(fw) for fw in REGISTRY.values()]
    total = len(summaries)
    items = summaries[offset : offset + limit]
    logger.info("frameworks_list", count=len(items), total=total, offset=offset, limit=limit)
    return PaginatedFrameworkSummaries(items=items, total=total, offset=offset, limit=limit)


@router.get("/frameworks/{framework_id}", response_model=FrameworkDetail)
async def get_framework(
    framework_id: str,
    current_user: dict = Depends(get_current_user),
) -> FrameworkDetail:
    """Return full framework with all controls by id."""
    try:
        fid = FrameworkId(framework_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Unknown framework: {framework_id}")
    fw = get(fid)
    if fw is None:
        raise HTTPException(status_code=404, detail=f"Framework not found: {framework_id}")
    return _framework_to_detail(fw)


@router.get("/frameworks/{framework_id}/controls", response_model=PaginatedControls)
async def list_framework_controls(
    framework_id: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: dict = Depends(get_current_user),
) -> PaginatedControls:
    """Paginated list of controls for a framework."""
    try:
        fid = FrameworkId(framework_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Unknown framework: {framework_id}")
    fw = get(fid)
    if fw is None:
        raise HTTPException(status_code=404, detail=f"Framework not found: {framework_id}")
    total = len(fw.controls)
    start = (page - 1) * page_size
    end = start + page_size
    items = [_control_to_out(c) for c in fw.controls[start:end]]
    return PaginatedControls(items=items, total=total, page=page, page_size=page_size)


# ---- Assessment run (SSE) — events match AssessmentEvent in compliance.ts ----


def _sse_event(event_kind: str, data: dict) -> str:
    """SSE line: event = kind, data = full AssessmentEvent payload (JSON)."""
    return f"event: {event_kind}\ndata: {json.dumps(data)}\n\n"


async def _run_assessment_stream(organization_id: str, framework_ids: list[FrameworkId]):
    """Stream AssessmentEvent-shaped events from assessment_engine; emit as SSE (event=kind, data=payload)."""
    from db.session import async_session_factory
    from core.assessment_engine import run_assessment_stream
    from core.tenant import set_tenant_context

    async with async_session_factory() as session:
        await set_tenant_context(session, organization_id)
        async for event in run_assessment_stream(session, organization_id, framework_ids):
            kind = event.get("kind", "error")
            yield _sse_event(kind, event)
        await session.commit()


def _validate_organization_id(organization_id: str) -> None:
    """Reject empty or invalid organization ids (input validation)."""
    if not organization_id or not organization_id.strip():
        raise HTTPException(status_code=400, detail="organization_id is required and cannot be empty")
    if ".." in organization_id or "/" in organization_id or "\\" in organization_id:
        raise HTTPException(status_code=400, detail="Invalid organization_id: path characters not allowed")


def _parse_frameworks(frameworks_str: str) -> list[FrameworkId]:
    """Parse comma-separated framework ids; raise HTTPException on unknown id."""
    ids = [s.strip() for s in frameworks_str.split(",") if s.strip()]
    fids: list[FrameworkId] = []
    for i in ids:
        try:
            fids.append(FrameworkId(i))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown framework: {i}")
    if not fids:
        raise HTTPException(status_code=400, detail="At least one framework required")
    return fids


class RunAssessmentBody(BaseModel):
    """JSON body for programmatic assessment kick-off (UI onboarding); SSE still uses GET stream."""

    org_id: str
    frameworks: list[str]


@router.post("/assessments/run")
async def run_assessment_post_json(
    body: RunAssessmentBody,
    current_user: dict = Depends(require_permission(Permission.run_assessment)),
) -> dict[str, Any]:
    """Accept run intent; client opens GET /assessments/stream for SSE (EventSource cannot POST)."""
    effective = resolve_scoped_org_id(current_user, body.org_id.strip())
    _validate_organization_id(effective)
    fids = _parse_frameworks(",".join(body.frameworks))
    return {
        "status": "accepted",
        "org_id": effective,
        "framework_ids": [x.value for x in fids],
        "stream_path": "/api/v1/assessments/stream",
    }


def _stream_response(org_id: str, fids: list[FrameworkId]) -> StreamingResponse:
    """Build SSE streaming response (shared by stream and run endpoints)."""
    return StreamingResponse(
        _run_assessment_stream(org_id, fids),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
            "Connection": "keep-alive",
        },
    )


@router.get("/assessments/stream", include_in_schema=True)
@router.get("/assessments/stream/", include_in_schema=False)  # allow trailing slash
async def stream_assessment(
    org_id: str = Query(..., description="Organization id (e.g. demo-org-001)"),
    frameworks: str = Query(
        ...,
        description="Comma-separated framework ids (e.g. iso27001-2022,gdpr-2016-679,...)",
    ),
    current_user: dict = Depends(require_permission_stream(Permission.run_assessment)),
) -> StreamingResponse:
    """Stream assessment run via SSE. Params: org_id, frameworks (comma-separated)."""
    _validate_organization_id(org_id)
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    fids = _parse_frameworks(frameworks)
    return _stream_response(effective, fids)


@router.get("/assessments/run", include_in_schema=True)
async def run_assessment(
    organization_id: str = Query(..., description="Organization id (e.g. demo-org-001)"),
    framework_ids: str = Query(
        ...,
        description="Comma-separated framework ids (e.g. iso27001-2022,gdpr-2016-679,...)",
    ),
    current_user: dict = Depends(require_permission_stream(Permission.run_assessment)),
) -> StreamingResponse:
    """Stream assessment run via SSE (alias). Params: organization_id, framework_ids."""
    _validate_organization_id(organization_id)
    effective = resolve_scoped_org_id(current_user, organization_id.strip())
    fids = _parse_frameworks(framework_ids)
    return _stream_response(effective, fids)


# ---- Human Review Queue (Postgres only — migrations 006 + 011) ----

_human_review_schema_verified: bool = False


async def _ensure_human_review_schema(session: AsyncSession) -> None:
    """Fail fast when human_review_* tables are missing (no in-memory fallback)."""
    global _human_review_schema_verified
    if _human_review_schema_verified:
        return
    try:
        await session.execute(text("SELECT 1 FROM human_review_pending LIMIT 1"))
        _human_review_schema_verified = True
    except SQLAlchemyError as e:
        logger.error("human_review_schema_missing", error=str(e))
        raise HTTPException(
            status_code=503,
            detail=(
                "Human review persistence is unavailable: apply migrations "
                "008_human_review_queue.sql and 011_operational_persistence.sql."
            ),
        ) from e


def _iso_ts(val: Any) -> str:
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _utc_datetime_for_asyncpg(val: Any) -> datetime:
    """asyncpg rejects ISO strings for timestamptz binds; use timezone-aware datetime."""
    if isinstance(val, datetime):
        return val if val.tzinfo is not None else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    raise TypeError(f"expected datetime or ISO string, got {type(val)}")


async def _fetch_pending_db(session: AsyncSession, org_id: str) -> list[dict[str, Any]]:
    r = await session.execute(
        text(
            "SELECT id, framework, control_id, name, assessment, confidence, severity, reference, date_flagged "
            "FROM human_review_pending WHERE org_id = :org ORDER BY id"
        ),
        {"org": org_id},
    )
    rows = []
    for row in r.mappings().all():
        d = dict(row)
        d["date_flagged"] = _iso_ts(d["date_flagged"])
        rows.append(d)
    return rows


async def _fetch_reviewed_db(session: AsyncSession, org_id: str) -> list[dict[str, Any]]:
    r = await session.execute(
        text(
            "SELECT item_id AS id, framework, control_id, action, acted_by, acted_at, "
            "original_confidence, final_decision, audit_ref "
            "FROM human_review_reviewed WHERE org_id = :org ORDER BY id"
        ),
        {"org": org_id},
    )
    rows = []
    for row in r.mappings().all():
        d = dict(row)
        d["acted_at"] = _iso_ts(d["acted_at"])
        rows.append(d)
    return rows


@router.get("/assessments/review-queue", response_model=ReviewQueueResponse)
async def get_review_queue(
    org_id: str | None = Query(None, description="Scoped organisation id (demo toggle)"),
    limit: int = Query(50, ge=1, le=200, description="Max pending items to return"),
    offset: int = Query(0, ge=0, description="Offset into pending items"),
    reviewed_limit: int = Query(100, ge=1, le=500, description="Max reviewed history rows"),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ReviewQueueResponse:
    """
    Human Review Queue for the scoped org: pending items (confidence < 0.75) and history.

    Items are enqueued by real activity — a wrong decision at expert difficulty in
    the Learning Loop (core/human_review.enqueue_learning_decision_review), or a
    low-confidence control assessment (core/assessment_llm). Until migration 029
    this endpoint served eight hardcoded rows to demo-org-001 and an empty list to
    everyone else, so a real tenant could never have a queue at all.

    An empty queue on a fresh install is the correct answer, not a missing fixture.
    """
    scope = (org_id or current_user.get("org_id") or DEMO_ORG_ID).strip()
    effective = await bind_scoped_org(session, current_user, scope)

    await _ensure_human_review_schema(session)
    pending = await _fetch_pending_db(session, effective)
    reviewed = await _fetch_reviewed_db(session, effective)
    total_pending = len(pending)
    total_reviewed = len(reviewed)
    pending_slice = pending[offset : offset + limit]
    reviewed_slice = reviewed[:reviewed_limit]
    return ReviewQueueResponse(
        items=[ReviewQueueItem(**x) for x in pending_slice],
        reviewed=[ReviewedItem(**x) for x in reviewed_slice],
        total_pending=total_pending,
        total_reviewed=total_reviewed,
        limit=limit,
        offset=offset,
    )


@router.post("/assessments/controls/{control_id}/approve")
async def approve_control(
    control_id: str,
    body: ApproveRequest,
    current_user: dict = Depends(require_permission(Permission.approve_review)),
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Approve a flagged assessment. Logged to audit fabric. Moves item to reviewed."""
    notes = (body.notes or "").strip()
    if not notes:
        raise HTTPException(status_code=400, detail="notes is required")
    org_scope = str(current_user.get("org_id") or DEMO_ORG_ID).strip()
    actor = _review_actor_id(current_user)

    await _ensure_human_review_schema(session)
    row = (
        await session.execute(
            text(
                """
                DELETE FROM human_review_pending
                WHERE org_id = :org AND id = :rid
                RETURNING framework, control_id, assessment, confidence
                """
            ),
            {"org": org_scope, "rid": control_id},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Control not in queue: {control_id}")
    acted_at = datetime.now(timezone.utc)
    audit_ref = f"audit-{control_id}-approve-{acted_at.date().isoformat()}"
    await session.execute(
        text(
            """
            INSERT INTO human_review_reviewed (
                org_id, item_id, framework, control_id, action, acted_by, acted_at,
                original_confidence, final_decision, audit_ref
            ) VALUES (
                :org_id, :item_id, :framework, :control_id, :action, :acted_by, :acted_at,
                :original_confidence, :final_decision, :audit_ref
            )
            """
        ),
        {
            "org_id": org_scope,
            "item_id": control_id,
            "framework": row["framework"],
            "control_id": row["control_id"],
            "action": "approved",
            "acted_by": actor,
            "acted_at": acted_at,
            "original_confidence": row["confidence"],
            "final_decision": row["assessment"],
            "audit_ref": audit_ref,
        },
    )
    await append_audit_log(
        session,
        event_type="human_review_approved",
        entity_type="human_review_item",
        entity_id=control_id,
        payload={
            "audit_ref": audit_ref,
            "acted_by": actor,
            "org_id": org_scope,
            "notes_preview": notes[:500],
        },
    )
    logger.info(
        "human_review_approve",
        control_id=control_id,
        notes=notes[:200],
        audit_ref=audit_ref,
        actor=actor,
    )
    return {"status": "approved", "control_id": control_id, "audit_ref": audit_ref}


@router.post("/assessments/controls/{control_id}/override")
async def override_control(
    control_id: str,
    body: OverrideRequest,
    current_user: dict = Depends(require_permission(Permission.override_review)),
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Override AI assessment. Logged immutably to audit fabric. Moves item to reviewed."""
    justification = (body.justification or "").strip()
    if len(justification) < 20:
        raise HTTPException(status_code=400, detail="justification must be at least 20 characters")
    if body.assessment not in ("COMPLIANT", "PARTIAL", "NON_COMPLIANT"):
        raise HTTPException(status_code=400, detail="assessment must be COMPLIANT, PARTIAL, or NON_COMPLIANT")
    org_scope = str(current_user.get("org_id") or DEMO_ORG_ID).strip()
    actor = _review_actor_id(current_user)

    await _ensure_human_review_schema(session)
    row = (
        await session.execute(
            text(
                """
                DELETE FROM human_review_pending
                WHERE org_id = :org AND id = :rid
                RETURNING framework, control_id, assessment, confidence
                """
            ),
            {"org": org_scope, "rid": control_id},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Control not in queue: {control_id}")
    acted_at = datetime.now(timezone.utc)
    audit_ref = f"audit-{control_id}-override-{acted_at.date().isoformat()}"
    await session.execute(
        text(
            """
            INSERT INTO human_review_reviewed (
                org_id, item_id, framework, control_id, action, acted_by, acted_at,
                original_confidence, final_decision, audit_ref
            ) VALUES (
                :org_id, :item_id, :framework, :control_id, :action, :acted_by, :acted_at,
                :original_confidence, :final_decision, :audit_ref
            )
            """
        ),
        {
            "org_id": org_scope,
            "item_id": control_id,
            "framework": row["framework"],
            "control_id": row["control_id"],
            "action": "overridden",
            "acted_by": actor,
            "acted_at": acted_at,
            "original_confidence": row["confidence"],
            "final_decision": body.assessment,
            "audit_ref": audit_ref,
        },
    )
    await append_audit_log(
        session,
        event_type="human_review_overridden",
        entity_type="human_review_item",
        entity_id=control_id,
        payload={
            "audit_ref": audit_ref,
            "acted_by": actor,
            "org_id": org_scope,
            "final_decision": body.assessment,
            "justification_preview": justification[:500],
        },
    )
    logger.info(
        "human_review_override",
        control_id=control_id,
        final_decision=body.assessment,
        justification_len=len(justification),
        audit_ref=audit_ref,
        actor=actor,
    )
    return {"status": "overridden", "control_id": control_id, "audit_ref": audit_ref}
