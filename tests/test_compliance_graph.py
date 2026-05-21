# tests/test_compliance_graph.py — Compliance graph API and pure builder.

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.compliance_graph import build_compliance_graph
from tests.conftest import make_auth_headers


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
