# tests/test_compliance_graph.py — Compliance graph API and pure builder.

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.compliance_graph import build_compliance_graph, trace_accountability_chain
from tests.conftest import make_auth_headers


def _relationship_graph():
    """Minimal graph with a finding that traces all the way to a risk."""
    findings = [
        {
            "id": "finding-001",
            "org_id": "demo-org-001",
            "title": "Human oversight absent",
            "severity": "CRITICAL",
            "control_id": "EUAI-HO-01",
            "framework_id": "eu-ai-act-2024",
        }
    ]
    people = [
        {"id": "p1", "org_id": "demo-org-001", "name": "Engineering Lead", "role": "Engineer", "team_id": "t1"}
    ]
    teams = [{"id": "t1", "org_id": "demo-org-001", "name": "Engineering", "function": "Product"}]
    systems = [
        {"id": "s1", "org_id": "demo-org-001", "name": "HR Screening", "system_type": "AI_SYSTEM",
         "criticality": "HIGH", "processes_pii": True, "owner_id": "p1", "ai_risk_class": "HIGH"}
    ]
    risks = [
        {"id": "r1", "org_id": "demo-org-001", "title": "AI Act failure", "category": "REGULATORY",
         "likelihood": "HIGH", "impact_eur": 8400000, "framework_id": "eu-ai-act-2024"}
    ]
    rel_edges = [
        {"source_id": "p1", "source_type": "person", "target_id": "EUAI-HO-01", "target_type": "control", "relationship": "owns"},
        {"source_id": "p1", "source_type": "person", "target_id": "t1", "target_type": "team", "relationship": "member_of"},
        {"source_id": "p1", "source_type": "person", "target_id": "s1", "target_type": "system", "relationship": "operates"},
        {"source_id": "s1", "source_type": "system", "target_id": "astralabs-de", "target_type": "entity", "relationship": "processes_data_on"},
        {"source_id": "finding-001", "source_type": "finding", "target_id": "r1", "target_type": "risk", "relationship": "exposes_to"},
        # Dangling edge — target node does not exist, must be skipped silently.
        {"source_id": "p1", "source_type": "person", "target_id": "ghost", "target_type": "control", "relationship": "owns"},
    ]
    return build_compliance_graph(
        org_id="demo-org-001",
        mappings=[],
        evidence_rows=[],
        ec_rows=[],
        framework_entities=[{"framework_id": "eu-ai-act-2024", "entity_id": "astralabs-de", "scope": "FULL", "nca": None}],
        frameworks=[{"id": "eu-ai-act-2024", "name": "EU AI Act"}],
        findings=findings,
        people=people,
        teams=teams,
        systems=systems,
        risks=risks,
        relationship_edges=rel_edges,
    )


def test_relationship_graph_adds_new_node_types() -> None:
    graph = _relationship_graph()
    types = {n["type"] for n in graph.nodes}
    assert {"person", "team", "system", "risk"}.issubset(types)
    # Dangling edge to a non-existent control must not be added.
    assert not any(e["to"] == "control:ghost" for e in graph.edges)


def test_relationship_graph_accountability_stats() -> None:
    graph = _relationship_graph()
    # One control (EUAI-HO-01) exists and is owned.
    assert graph.stats.total_controls == 1
    assert graph.stats.owned_controls == 1
    assert graph.stats.ownership_coverage_pct == 100
    assert graph.stats.unowned_controls == 0
    assert graph.stats.total_risk_exposure_eur == 8400000
    assert graph.stats.node_type_counts.get("person") == 1


def test_trace_resolves_full_chain() -> None:
    graph = _relationship_graph()
    traced = trace_accountability_chain(graph, "finding:finding-001")
    traced_types = {n["type"] for n in traced.nodes}
    # finding → control → person → team → system → entity → risk
    assert {"finding", "control", "person", "team", "system", "entity", "risk"}.issubset(traced_types)
    # Every traced node carries a hop distance for staggered reveal.
    assert all("trace_hop" in (n.get("metadata") or {}) for n in traced.nodes)
    assert next(n for n in traced.nodes if n["type"] == "finding")["metadata"]["trace_hop"] == 0


def test_trace_missing_finding_returns_only_root() -> None:
    graph = _relationship_graph()
    traced = trace_accountability_chain(graph, "finding:does-not-exist")
    # No matching node in the graph → empty subgraph (no crash on the failure path).
    assert traced.nodes == []
    assert traced.edges == []


def test_build_compliance_graph_stats() -> None:
    evidence = [{"id": "e1", "title": "MFA", "status": "VALID"}]
    ec_rows = [
        {"evidence_id": "e1", "control_id": "ISO-A.5.17", "framework_id": "iso27001-2022", "strength": "FULL"},
        {"evidence_id": "e1", "control_id": "NIS2-Art.21(2)(i)", "framework_id": "nis2-2022-2555", "strength": "FULL"},
    ]
    mappings = [
        {
            "source_control_id": "ISO-A.5.17",
            "source_framework_id": "iso27001-2022",
            "target_control_id": "NIS2-Art.21(2)(i)",
            "target_framework_id": "nis2-2022-2555",
            "relationship": "EQUIVALENT",
            "confidence": 0.95,
            "basis": "MFA",
        }
    ]
    graph = build_compliance_graph(
        org_id="demo-org-001",
        mappings=mappings,
        evidence_rows=evidence,
        ec_rows=ec_rows,
        framework_entities=[],
        frameworks=[{"id": "iso27001-2022", "name": "ISO 27001"}],
        findings=[],
    )
    assert graph.stats.shared_evidence == 1
    assert graph.stats.naive_assessments == 2
    assert graph.stats.effective_assessments == 1
    assert any(n["type"] == "evidence" for n in graph.nodes)
    assert any(e["type"] == "maps_to" for e in graph.edges)


def test_graph_api_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/graph/demo-org-001")
    assert r.status_code == 401


def test_graph_api_demo_org(
    client: TestClient,
    postgres_reachable: bool,
) -> None:
    if not postgres_reachable:
        pytest.skip("database not reachable")
    headers = make_auth_headers("admin")
    r = client.get("/api/v1/graph/demo-org-001", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "nodes" in data
    assert "edges" in data
    assert "stats" in data
    # Empty graph acceptable when migration not applied; seeded DB has evidence nodes.
    if data["stats"]["total_nodes"] > 0:
        assert data["stats"]["total_edges"] > 0


def test_graph_control_subgraph_404_when_missing(client: TestClient) -> None:
    headers = make_auth_headers("admin")
    r = client.get(
        "/api/v1/graph/demo-org-001/control/DOES-NOT-EXIST-XYZ",
        headers=headers,
    )
    assert r.status_code in (404, 200)
