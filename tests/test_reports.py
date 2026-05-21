# tests/test_reports.py — Executive summary report endpoint tests.

from __future__ import annotations

from fastapi.testclient import TestClient


def test_executive_summary_no_auth(client: TestClient) -> None:
    r = client.get("/api/v1/reports/executive-summary")
    assert r.status_code == 401


def test_executive_summary_with_auth(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get(
        "/api/v1/reports/executive-summary",
        headers=auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "framework_summary" in data
    assert "evidence_vault" in data


def test_executive_summary_pdf_export_no_auth(client: TestClient) -> None:
    r = client.get("/api/v1/reports/executive-summary/export?format=pdf")
    assert r.status_code == 401


def test_executive_summary_pdf_export_with_auth(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get(
        "/api/v1/reports/executive-summary/export",
        params={"format": "pdf", "org_id": "demo-org-001"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    assert "attachment" in (r.headers.get("content-disposition") or "").lower()
