# api/assessments.py — Frameworks and assessments API. Follow this pattern for new endpoints.
# SSE streaming for assessment runs.

from __future__ import annotations

import json
import structlog
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from compliance import FrameworkId, REGISTRY, get
from compliance.models import Control, Framework

from api.schemas import (
    ControlOut,
    EvidenceTypeOut,
    FrameworkDetail,
    FrameworkSummary,
    PaginatedControls,
    RequirementOut,
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
async def list_frameworks() -> list[FrameworkSummary]:
    """List all registered frameworks with summaries (no full controls)."""
    summaries = [_framework_to_summary(fw) for fw in REGISTRY.values()]
    logger.info("frameworks_list", count=len(summaries))
    return summaries


@router.get("/frameworks/{framework_id}", response_model=FrameworkDetail)
async def get_framework(framework_id: str) -> FrameworkDetail:
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
) -> StreamingResponse:
    """Stream assessment run via SSE (alias). Params: organization_id, framework_ids."""
    _validate_organization_id(organization_id)
    fids = _parse_frameworks(framework_ids)
    return _stream_response(organization_id, fids)
