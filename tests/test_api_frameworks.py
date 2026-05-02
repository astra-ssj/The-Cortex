# tests/test_api_frameworks.py — Frameworks API endpoints.

from __future__ import annotations

from fastapi.testclient import TestClient


def test_list_frameworks(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /api/v1/frameworks returns list of framework summaries."""
    r = client.get("/api/v1/frameworks", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    ids = {fw["id"] for fw in data}
    assert "nist-csf-2.0" in ids
    assert "gdpr-2016-679" in ids
    assert "nis2-2022-2555" in ids
    assert len(data) == 8  # Exactly 8 frameworks (no SOC2, HIPAA, PCI_DSS, CCPA)
    for fw in data:
        assert "id" in fw and "name" in fw and "version" in fw
        assert "control_count" in fw and isinstance(fw["control_count"], int)


def test_get_framework(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /api/v1/frameworks/:id returns full framework with controls."""
    r = client.get("/api/v1/frameworks/gdpr-2016-679", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "gdpr-2016-679"
    assert "controls" in data
    assert len(data["controls"]) >= 1
    # Check nested structure
    if data["controls"]:
        c = data["controls"][0]
        assert "id" in c and "name" in c and "requirements" in c


def test_get_framework_unknown_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /api/v1/frameworks/unknown returns 404."""
    r = client.get("/api/v1/frameworks/unknown", headers=auth_headers)
    assert r.status_code == 404


def test_list_framework_controls_paginated(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /api/v1/frameworks/:id/controls returns paginated controls."""
    r = client.get(
        "/api/v1/frameworks/gdpr-2016-679/controls?page=1&page_size=2",
        headers=auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "total" in data and "page" in data and "page_size" in data
    assert data["page"] == 1 and data["page_size"] == 2
    assert len(data["items"]) <= 2
    assert data["total"] >= len(data["items"])
