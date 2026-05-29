# api/graph.py — Compliance graph traversal (cross-framework intelligence).

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.findings import FINDINGS_STORE
from core.compliance_graph import (
    ComplianceGraphOut,
    build_compliance_graph,
    subgraph_around_node,
    trace_accountability_chain,
)
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, resolve_scoped_org_id

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/graph", tags=["graph"])


async def _load_graph_inputs(
    session: AsyncSession,
    org_id: str,
) -> tuple[list, list, list, list, list, list]:
    """Load graph tables; empty lists when migration not applied."""
    try:
        mappings = (
            await session.execute(
                text(
                    """
                    SELECT source_control_id, source_framework_id, target_control_id,
                           target_framework_id, relationship, confidence, basis
                    FROM control_mappings
                    """
                )
            )
        ).mappings().all()
        evidence = (
            await session.execute(
                text(
                    """
                    SELECT id::text AS id, org_id, title, description, evidence_type, source,
                           status, collected_at, expires_at
                    FROM evidence WHERE org_id = :org_id
                    ORDER BY collected_at DESC
                    """
                ),
                {"org_id": org_id},
            )
        ).mappings().all()
        ec_rows = (
            await session.execute(
                text(
                    """
                    SELECT ec.evidence_id::text AS evidence_id, ec.control_id, ec.framework_id, ec.strength
                    FROM evidence_controls ec
                    JOIN evidence e ON e.id = ec.evidence_id
                    WHERE e.org_id = :org_id
                    """
                ),
                {"org_id": org_id},
            )
        ).mappings().all()
        fe_rows = (
            await session.execute(
                text(
                    """
                    SELECT framework_id, entity_id, scope, nca
                    FROM framework_entities
                    """
                )
            )
        ).mappings().all()
        frameworks = (
            await session.execute(text("SELECT id, name FROM frameworks ORDER BY id"))
        ).mappings().all()
        return (
            [dict(r) for r in mappings],
            [dict(r) for r in evidence],
            [dict(r) for r in ec_rows],
            [dict(r) for r in fe_rows],
            [dict(r) for r in frameworks],
            [f for f in FINDINGS_STORE if f.get("org_id", DEMO_ORG_ID) == org_id],
        )
    except ProgrammingError:
        await session.rollback()
        return [], [], [], [], [], [
            f for f in FINDINGS_STORE if f.get("org_id", DEMO_ORG_ID) == org_id
        ]


async def _load_relationship_inputs(
    session: AsyncSession,
    org_id: str,
) -> tuple[list, list, list, list, list]:
    """Load relationship-graph tables; empty lists when migration 015 not applied."""
    try:
        people = (
            await session.execute(
                text(
                    """
                    SELECT id::text AS id, org_id, name, role, email,
                           team_id::text AS team_id, reports_to::text AS reports_to
                    FROM rel_people WHERE org_id = :org_id
                    """
                ),
                {"org_id": org_id},
            )
        ).mappings().all()
        teams = (
            await session.execute(
                text(
                    """
                    SELECT id::text AS id, org_id, name, function, lead_id::text AS lead_id
                    FROM rel_teams WHERE org_id = :org_id
                    """
                ),
                {"org_id": org_id},
            )
        ).mappings().all()
        systems = (
            await session.execute(
                text(
                    """
                    SELECT id::text AS id, org_id, name, system_type, criticality,
                           processes_pii, owner_id::text AS owner_id, ai_risk_class
                    FROM rel_systems WHERE org_id = :org_id
                    """
                ),
                {"org_id": org_id},
            )
        ).mappings().all()
        risks = (
            await session.execute(
                text(
                    """
                    SELECT id::text AS id, org_id, title, category, likelihood,
                           impact_eur, framework_id
                    FROM rel_risks WHERE org_id = :org_id
                    """
                ),
                {"org_id": org_id},
            )
        ).mappings().all()
        rel_edges = (
            await session.execute(
                text(
                    """
                    SELECT source_id, source_type, target_id, target_type,
                           relationship, weight
                    FROM relationship_edges WHERE org_id = :org_id
                    """
                ),
                {"org_id": org_id},
            )
        ).mappings().all()
        return (
            [dict(r) for r in people],
            [dict(r) for r in teams],
            [dict(r) for r in systems],
            [dict(r) for r in risks],
            [dict(r) for r in rel_edges],
        )
    except ProgrammingError:
        await session.rollback()
        return [], [], [], [], []


async def _build_org_graph(session: AsyncSession, org_id: str) -> ComplianceGraphOut:
    mappings, evidence, ec_rows, fe_rows, frameworks, findings = await _load_graph_inputs(
        session, org_id
    )
    people, teams, systems, risks, rel_edges = await _load_relationship_inputs(
        session, org_id
    )
    return build_compliance_graph(
        org_id=org_id,
        mappings=mappings,
        evidence_rows=evidence,
        ec_rows=ec_rows,
        framework_entities=fe_rows,
        frameworks=frameworks,
        findings=findings,
        people=people,
        teams=teams,
        systems=systems,
        risks=risks,
        relationship_edges=rel_edges,
    )


def _resolve_node_id(graph: ComplianceGraphOut, raw_id: str, node_type: str) -> str:
    """Accept bare ids (ISO-A.5.17) or prefixed node ids."""
    if raw_id.startswith(f"{node_type}:"):
        return raw_id
    prefix = {
        "control": "control:",
        "evidence": "evidence:",
        "finding": "finding:",
        "person": "person:",
        "team": "team:",
        "system": "system:",
        "risk": "risk:",
    }.get(node_type, "")
    candidate = f"{prefix}{raw_id}"
    for n in graph.nodes:
        if str(n["id"]) == candidate or str(n["id"]).endswith(raw_id):
            return str(n["id"])
    return candidate


@router.get("/{org_id}", summary="Full compliance graph for organisation")
async def get_org_graph(
    org_id: str,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ComplianceGraphOut:
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    return await _build_org_graph(session, effective)


@router.get("/{org_id}/control/{control_id}", summary="Subgraph for one control")
async def get_control_subgraph(
    org_id: str,
    control_id: str,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ComplianceGraphOut:
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    graph = await _build_org_graph(session, effective)
    node_id = _resolve_node_id(graph, control_id, "control")
    if not any(str(n["id"]) == node_id for n in graph.nodes):
        raise HTTPException(status_code=404, detail="Control not found in graph")
    return subgraph_around_node(graph, node_id)


@router.get("/{org_id}/evidence/{evidence_id}", summary="Controls satisfied by one evidence item")
async def get_evidence_coverage(
    org_id: str,
    evidence_id: str,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ComplianceGraphOut:
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    graph = await _build_org_graph(session, effective)
    node_id = _resolve_node_id(graph, evidence_id, "evidence")
    if not any(str(n["id"]) == node_id for n in graph.nodes):
        raise HTTPException(status_code=404, detail="Evidence not found in graph")
    return subgraph_around_node(graph, node_id)


@router.get("/{org_id}/impact/{finding_id}", summary="Blast radius for a finding")
async def get_finding_impact(
    org_id: str,
    finding_id: str,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ComplianceGraphOut:
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    graph = await _build_org_graph(session, effective)
    node_id = _resolve_node_id(graph, finding_id, "finding")
    if not any(str(n["id"]) == node_id for n in graph.nodes):
        raise HTTPException(status_code=404, detail="Finding not found in graph")
    return subgraph_around_node(graph, node_id)


@router.get("/{org_id}/person/{person_id}", summary="Accountability view for one person")
async def get_person_accountability(
    org_id: str,
    person_id: str,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ComplianceGraphOut:
    """Everything a person touches: controls owned, team, systems operated, hierarchy."""
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    graph = await _build_org_graph(session, effective)
    node_id = _resolve_node_id(graph, person_id, "person")
    if not any(str(n["id"]) == node_id for n in graph.nodes):
        raise HTTPException(status_code=404, detail="Person not found in graph")
    return subgraph_around_node(graph, node_id)


@router.get("/{org_id}/trace/{finding_id}", summary="Accountability + exposure chain for a finding")
async def get_finding_trace(
    org_id: str,
    finding_id: str,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ComplianceGraphOut:
    """The full chain: finding → control → owner → team → system → entity → risk."""
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    graph = await _build_org_graph(session, effective)
    node_id = _resolve_node_id(graph, finding_id, "finding")
    if not any(str(n["id"]) == node_id for n in graph.nodes):
        raise HTTPException(status_code=404, detail="Finding not found in graph")
    return trace_accountability_chain(graph, node_id)
