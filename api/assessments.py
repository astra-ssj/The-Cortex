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


# ---- Assessment run (SSE) ----


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _run_assessment_stream(organization_id: str, framework_ids: list[FrameworkId]):
    """Async generator: yield SSE events for each control (context + demo result)."""
    from db.session import async_session_factory
    from services.context_builder import get_context_for_control

    async with async_session_factory() as session:
        for fid in framework_ids:
            fw = get(fid)
            if fw is None:
                continue
            yield _sse_event("framework_start", {"framework_id": fid.value, "name": fw.name})
            for control in fw.controls:
                ctx = await get_context_for_control(session, organization_id, control)
                if ctx is None:
                    yield _sse_event("error", {"control_id": control.id, "message": "Organization not found"})
                    continue
                yield _sse_event("context", {"framework_id": fid.value, "control_id": control.id, "context": ctx})
                # Demo: no LLM call; emit placeholder result (real run would use CircuitBreaker-wrapped LLM).
                yield _sse_event("result", {
                    "framework_id": fid.value,
                    "control_id": control.id,
                    "control_name": control.name,
                    "status": "assessed",
                    "finding": f"Demo assessment for {control.name} (org={organization_id}). Context built.",
                })
            yield _sse_event("framework_done", {"framework_id": fid.value})
    yield _sse_event("done", {})


@router.get("/assessments/run")
async def run_assessment(
    organization_id: str = Query(..., description="Organization id (e.g. demo-org-001)"),
    framework_ids: str = Query("gdpr,nis2", description="Comma-separated framework ids"),
) -> StreamingResponse:
    """Stream assessment run via SSE. Uses Context Builder for each control; demo run emits placeholder results."""
    ids = [s.strip() for s in framework_ids.split(",") if s.strip()]
    fids: list[FrameworkId] = []
    for i in ids:
        try:
            fids.append(FrameworkId(i))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown framework: {i}")
    if not fids:
        raise HTTPException(status_code=400, detail="At least one framework_id required")
    return StreamingResponse(
        _run_assessment_stream(organization_id, fids),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
