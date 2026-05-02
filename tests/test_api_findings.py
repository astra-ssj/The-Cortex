# tests/test_api_findings.py — GET /api/v1/findings and PATCH /api/v1/findings/{id}.

from __future__ import annotations

from fastapi.testclient import TestClient


def test_list_findings_returns_12(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /api/v1/findings returns 12 seeded findings."""
    r = client.get("/api/v1/findings", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 12


def test_list_findings_filter_by_status(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /api/v1/findings?status=OPEN returns only OPEN findings."""
    r = client.get("/api/v1/findings", params={"status": "OPEN"}, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert all(f["status"] == "OPEN" for f in data)
    assert len(data) >= 1


def test_list_findings_filter_by_severity(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /api/v1/findings?severity=CRITICAL returns only CRITICAL."""
    r = client.get("/api/v1/findings", params={"severity": "CRITICAL"}, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert all(f["severity"] == "CRITICAL" for f in data)


def test_update_finding_status(client: TestClient, auth_headers: dict[str, str]) -> None:
    """PATCH /api/v1/findings/{id} updates status."""
    r = client.get("/api/v1/findings", headers=auth_headers)
    assert r.status_code == 200
    findings = r.json()
    fid = findings[0]["id"]
    original_status = findings[0]["status"]
    new_status = "IN_PROGRESS" if original_status == "OPEN" else "OPEN"
    r2 = client.patch(f"/api/v1/findings/{fid}", json={"status": new_status}, headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["status"] == new_status
    # Restore
    client.patch(f"/api/v1/findings/{fid}", json={"status": original_status}, headers=auth_headers)


def test_update_finding_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    """PATCH /api/v1/findings/nonexistent returns 404."""
    r = client.patch(
        "/api/v1/findings/nonexistent-id-999",
        json={"status": "OPEN"},
        headers=auth_headers,
    )
    assert r.status_code == 404
