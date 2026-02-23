# api/assessments.py — Frameworks and assessments API. Follow this pattern for new endpoints.
# SSE streaming for assessment runs. Human Review Queue (GDPR Art.22 / EU AI Act Art.14).

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query

from core.security import get_current_user, get_current_user_optional, get_current_user_stream
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from compliance import FrameworkId, REGISTRY, get
from compliance.models import Control, Framework

from api.schemas import (
    ControlOut,
    EvidenceTypeOut,
    FrameworkDetail,
    FrameworkSummary,
    PaginatedControls,
    RequirementOut,
    ReviewQueueItem,
    ReviewQueueResponse,
    ReviewedItem,
)

logger = structlog.get_logger()

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


@router.get("/frameworks", response_model=list[FrameworkSummary])
async def list_frameworks(
    current_user: dict = Depends(get_current_user),
) -> list[FrameworkSummary]:
    """List all registered frameworks with summaries (no full controls)."""
    summaries = [_framework_to_summary(fw) for fw in REGISTRY.values()]
    logger.info("frameworks_list", count=len(summaries))
    return summaries


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
    from services.assessment_engine import run_assessment_stream

    async with async_session_factory() as session:
        async for event in run_assessment_stream(session, organization_id, framework_ids):
            kind = event.get("kind", "error")
            yield _sse_event(kind, event)


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
    current_user: dict = Depends(get_current_user_optional),
) -> StreamingResponse:
    """Stream assessment run via SSE. Params: org_id, frameworks (comma-separated)."""
    _validate_organization_id(org_id)
    fids = _parse_frameworks(frameworks)
    return _stream_response(org_id, fids)


@router.get("/assessments/run", include_in_schema=True)
async def run_assessment(
    organization_id: str = Query(..., description="Organization id (e.g. demo-org-001)"),
    framework_ids: str = Query(
        ...,
        description="Comma-separated framework ids (e.g. iso27001-2022,gdpr-2016-679,...)",
    ),
    current_user: dict = Depends(get_current_user_stream),
) -> StreamingResponse:
    """Stream assessment run via SSE (alias). Params: organization_id, framework_ids."""
    _validate_organization_id(organization_id)
    fids = _parse_frameworks(framework_ids)
    return _stream_response(organization_id, fids)


# ---- Human Review Queue (in-memory seed; approve/override logged to audit fabric) ----


def _review_queue_seed() -> list[dict[str, Any]]:
    """Eight realistic flagged items for human oversight (confidence < 0.75)."""
    t = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return [
        {
            "id": "review-1",
            "framework": "GDPR 2016/679",
            "control_id": "GDPR-BN-02",
            "name": "72-hour breach notification procedure",
            "assessment": "NON_COMPLIANT",
            "confidence": 0.58,
            "severity": "CRITICAL",
            "reference": "GDPR Art.33(1)",
            "date_flagged": t,
        },
        {
            "id": "review-2",
            "framework": "NIS2 Directive",
            "control_id": "NIS2-IR-01",
            "name": "24-hour CSIRT early warning process",
            "assessment": "NON_COMPLIANT",
            "confidence": 0.61,
            "severity": "CRITICAL",
            "reference": "NIS2 Art.23(4)(a)",
            "date_flagged": t,
        },
        {
            "id": "review-3",
            "framework": "EU AI Act 2024",
            "control_id": "EUAI-HO-01",
            "name": "Human oversight mechanism for AI decisions",
            "assessment": "NON_COMPLIANT",
            "confidence": 0.52,
            "severity": "CRITICAL",
            "reference": "EU AI Act Art.14",
            "date_flagged": t,
        },
        {
            "id": "review-4",
            "framework": "ISO/IEC 27001:2022",
            "control_id": "ISO-A.5.23",
            "name": "Information security for cloud services",
            "assessment": "PARTIAL",
            "confidence": 0.68,
            "severity": "HIGH",
            "reference": "ISO 27001 A.5.23",
            "date_flagged": t,
        },
        {
            "id": "review-5",
            "framework": "NIS2 Directive",
            "control_id": "NIS2-RM-04",
            "name": "Supply chain security assessment",
            "assessment": "NON_COMPLIANT",
            "confidence": 0.64,
            "severity": "HIGH",
            "reference": "NIS2 Art.21(2)(d)",
            "date_flagged": t,
        },
        {
            "id": "review-6",
            "framework": "GDPR 2016/679",
            "control_id": "GDPR-IT-01",
            "name": "US transfer SCCs post-Schrems II review",
            "assessment": "PARTIAL",
            "confidence": 0.71,
            "severity": "HIGH",
            "reference": "GDPR Art.46",
            "date_flagged": t,
        },
        {
            "id": "review-7",
            "framework": "ISO/IEC 27001:2022",
            "control_id": "ISO-A.8.8",
            "name": "Management of technical vulnerabilities",
            "assessment": "PARTIAL",
            "confidence": 0.69,
            "severity": "MEDIUM",
            "reference": "ISO 27001 A.8.8",
            "date_flagged": t,
        },
        {
            "id": "review-8",
            "framework": "Cyber Essentials v3.1",
            "control_id": "CE-PF-01",
            "name": "Boundary firewalls and internet gateways",
            "assessment": "PARTIAL",
            "confidence": 0.73,
            "severity": "MEDIUM",
            "reference": "Cyber Essentials Section 3.1",
            "date_flagged": t,
        },
    ]


# Module-level in-memory store: pending items (mutable), reviewed list (append-only for session).
_review_queue_pending: list[dict[str, Any]] = []
_review_queue_reviewed: list[dict[str, Any]] = []
_review_queue_initialized = False


def _ensure_review_queue_seed() -> None:
    global _review_queue_initialized
    if not _review_queue_initialized:
        _review_queue_pending.extend(_review_queue_seed())
        _review_queue_initialized = True


@router.get("/assessments/review-queue", response_model=ReviewQueueResponse)
async def get_review_queue(
    current_user: dict = Depends(get_current_user),
) -> ReviewQueueResponse:
    """Return Human Review Queue: pending items (confidence < 0.75) and reviewed items."""
    _ensure_review_queue_seed()
    items = [ReviewQueueItem(**x) for x in _review_queue_pending]
    reviewed = [ReviewedItem(**x) for x in _review_queue_reviewed]
    return ReviewQueueResponse(items=items, reviewed=reviewed)


class ApproveRequestBody(BaseModel):
    notes: str


class OverrideRequestBody(BaseModel):
    assessment: str
    justification: str


@router.post("/assessments/controls/{control_id}/approve")
async def approve_control(
    control_id: str,
    body: ApproveRequestBody,
    current_user: dict = Depends(get_current_user),
) -> dict[str, str]:
    """Approve a flagged assessment. Logged to audit fabric. Moves item to reviewed."""
    _ensure_review_queue_seed()
    notes = (body.notes or "").strip()
    if not notes:
        raise HTTPException(status_code=400, detail="notes is required")
    idx = next((i for i, x in enumerate(_review_queue_pending) if x["id"] == control_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Control not in queue: {control_id}")
    item = _review_queue_pending.pop(idx)
    acted_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    reviewed_entry = {
        "id": item["id"],
        "framework": item["framework"],
        "control_id": item["control_id"],
        "action": "approved",
        "acted_by": "CISO",
        "acted_at": acted_at,
        "original_confidence": item["confidence"],
        "final_decision": item["assessment"],
        "audit_ref": f"audit-{control_id}-approve-{acted_at[:10]}",
    }
    _review_queue_reviewed.append(reviewed_entry)
    logger.info(
        "human_review_approve",
        control_id=control_id,
        notes=notes[:200],
        audit_ref=reviewed_entry["audit_ref"],
    )
    return {"status": "approved", "control_id": control_id, "audit_ref": reviewed_entry["audit_ref"]}


@router.post("/assessments/controls/{control_id}/override")
async def override_control(
    control_id: str,
    body: OverrideRequestBody,
    current_user: dict = Depends(get_current_user),
) -> dict[str, str]:
    """Override AI assessment. Logged immutably to audit fabric. Moves item to reviewed."""
    _ensure_review_queue_seed()
    justification = (body.justification or "").strip()
    if len(justification) < 20:
        raise HTTPException(status_code=400, detail="justification must be at least 20 characters")
    if body.assessment not in ("COMPLIANT", "PARTIAL", "NON_COMPLIANT"):
        raise HTTPException(status_code=400, detail="assessment must be COMPLIANT, PARTIAL, or NON_COMPLIANT")
    idx = next((i for i, x in enumerate(_review_queue_pending) if x["id"] == control_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Control not in queue: {control_id}")
    item = _review_queue_pending.pop(idx)
    acted_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    reviewed_entry = {
        "id": item["id"],
        "framework": item["framework"],
        "control_id": item["control_id"],
        "action": "overridden",
        "acted_by": "CISO",
        "acted_at": acted_at,
        "original_confidence": item["confidence"],
        "final_decision": body.assessment,
        "audit_ref": f"audit-{control_id}-override-{acted_at[:10]}",
    }
    _review_queue_reviewed.append(reviewed_entry)
    logger.info(
        "human_review_override",
        control_id=control_id,
        final_decision=body.assessment,
        justification_len=len(justification),
        audit_ref=reviewed_entry["audit_ref"],
    )
    return {"status": "overridden", "control_id": control_id, "audit_ref": reviewed_entry["audit_ref"]}
