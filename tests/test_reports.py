# tests/test_reports.py — Executive summary report endpoint tests.

from __future__ import annotations

from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_executive_summary_no_auth() -> None:
    r = client.get("/api/v1/reports/executive-summary")
    assert r.status_code == 401


def test_executive_summary_with_auth() -> None:
    login = client.post(
        "/api/v1/auth/token",
        data={"username": "ciso@astralabs.com", "password": "cortex-ciso-2026"},
    )
    token = login.json()["access_token"]
    r = client.get(
        "/api/v1/reports/executive-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert "framework_summary" in r.json()
