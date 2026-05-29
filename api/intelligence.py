# api/intelligence.py — Intelligence Engine endpoints.
#
# Exposes the reasoning layer (core/intelligence_engine.py) over the compliance graph.
# The engine reasons over the same org-scoped ComplianceGraphOut that powers
# GET /api/v1/graph/{org_id}, so insights, the graph view, and the trace overlay can
# never disagree about the underlying facts.

from __future__ import annotations

from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.graph import _build_org_graph
from core.audit_fabric import audit_fabric
from core.compliance_graph import ComplianceGraphOut, subgraph_for_nodes
from core.intelligence_engine import generate_insights, summarize_insights
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, resolve_scoped_org_id

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/intelligence", tags=["intelligence"])


def _resolve_org(current_user: dict[str, Any], requested: Optional[str]) -> str:
    """Tenant isolation: honour an explicit org id through the scoping guard, else the
    caller's own org, else the shared demo dataset."""
    if requested and requested.strip():
        return resolve_scoped_org_id(current_user, requested.strip())
    return str(current_user.get("org_id") or DEMO_ORG_ID).strip()


@router.get("/insights", summary="Ranked inferred insights for the organisation")
async def get_insights(
    org_id: Optional[str] = Query(None, description="Scoped organisation id (demo toggle)"),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Traverse the compliance graph and return ranked, inferred insights.

    Read-only and idempotent, but the result is a consequential interpretation of the
    org's posture, so the generation is recorded to the audit fabric for traceability.
    """
    effective = _resolve_org(current_user, org_id)
    graph = await _build_org_graph(session, effective)
    insights = generate_insights(graph)
    summary = summarize_insights(graph, insights)

    audit_fabric.log(
        event_type="intelligence.insights.generated",
        entity_type="organisation",
        entity_id=effective,
        payload={
            "actor": str(current_user.get("sub") or "unknown"),
            "insight_count": len(insights),
            "critical": summary["critical"],
            "high": summary["high"],
            "total_exposure_eur": summary["total_exposure_eur"],
        },
    )

    return {
        "insights": [
            {
                "id": ins.id,
                "severity": ins.severity,
                "category": ins.category,
                "title": ins.title,
                "detail": ins.detail,
                "related_nodes": ins.related_nodes,
                "action": ins.action,
                "computed_at": ins.computed_at,
            }
            for ins in insights
        ],
        "summary": summary,
    }


@router.get(
    "/insights/{insight_id}/trace",
    summary="Graph subgraph for an insight's related nodes",
)
async def get_insight_trace(
    insight_id: str,
    org_id: Optional[str] = Query(None, description="Scoped organisation id (demo toggle)"),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ComplianceGraphOut:
    """Return the subgraph spanning an insight's related nodes so the UI can highlight
    the chain. Insight ids are deterministic, so regenerating and matching is stable."""
    effective = _resolve_org(current_user, org_id)
    graph = await _build_org_graph(session, effective)
    insights = generate_insights(graph)
    insight = next((i for i in insights if i.id == insight_id), None)
    if insight is None:
        raise HTTPException(status_code=404, detail="Insight not found")
    return subgraph_for_nodes(graph, insight.related_nodes)
