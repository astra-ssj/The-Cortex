# tests/test_api_posture.py — GET /api/v1/organisations/{org_id} and posture.

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_get_posture_demo_org_returns_200() -> None:
    """GET /api/v1/organisations/demo-org-001/posture returns CompliancePosture (mock)."""
    r = client.get("/api/v1/organisations/demo-org-001/posture")
    assert r.status_code == 200
    data = r.json()
    assert data["organisationId"] == "demo-org-001"
    assert data["organisationName"] == "AstraLabs Group"
    assert "frameworks" in data
    assert "updatedAt" in data


def test_get_posture_demo_org_shape_matches_typescript() -> None:
    """Response shape matches CompliancePosture (camelCase, frameworks with controls)."""
    r = client.get("/api/v1/organisations/demo-org-001/posture")
    assert r.status_code == 200
    data = r.json()
    assert set(data.keys()) == {"organisationId", "organisationName", "frameworks", "updatedAt"}
    for fw in data["frameworks"]:
        assert set(fw.keys()) == {"frameworkId", "frameworkName", "controlCount", "controls"}
        for c in fw["controls"]:
            assert set(c.keys()) >= {"controlId", "controlName", "status"}
            assert c["status"] in ("compliant", "partial", "non_compliant", "not_assessed")


def test_get_posture_demo_org_includes_all_frameworks() -> None:
    """Mock posture includes all registered frameworks (8)."""
    r = client.get("/api/v1/organisations/demo-org-001/posture")
    assert r.status_code == 200
    ids = {fw["frameworkId"] for fw in r.json()["frameworks"]}
    assert "gdpr-2016-679" in ids
    assert "nis2-2022-2555" in ids
    assert len(ids) == 8


def test_get_organisation_demo_org() -> None:
    """GET /api/v1/organisations/demo-org-001 returns org profile."""
    r = client.get("/api/v1/organisations/demo-org-001")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "demo-org-001"
    assert data["name"] == "AstraLabs Group"
    assert "jurisdiction" in data
    assert data.get("industry") == "Technology"


def test_get_organisation_unknown_404() -> None:
    """GET /api/v1/organisations/unknown returns 404."""
    r = client.get("/api/v1/organisations/unknown-org")
    assert r.status_code == 404


def test_get_posture_unknown_org_404() -> None:
    """GET /api/v1/organisations/unknown-org/posture returns 404."""
    r = client.get("/api/v1/organisations/unknown-org/posture")
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()
