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
    assert "framework_summary" in r.json()
