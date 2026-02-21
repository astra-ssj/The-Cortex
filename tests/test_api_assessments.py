# tests/test_api_assessments.py — GET /api/v1/assessments/run (SSE) and input validation.

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_assessments_run_rejects_empty_organization_id() -> None:
    """GET /api/v1/assessments/run with empty organization_id returns 400."""
    r = client.get(
        "/api/v1/assessments/run",
        params={"organization_id": "", "framework_ids": "gdpr"},
    )
    assert r.status_code == 400
    assert "required" in r.json()["detail"].lower() or "empty" in r.json()["detail"].lower()


def test_assessments_run_rejects_whitespace_organization_id() -> None:
    """GET /api/v1/assessments/run with whitespace-only organization_id returns 400."""
    r = client.get(
        "/api/v1/assessments/run",
        params={"organization_id": "   ", "framework_ids": "gdpr"},
    )
    assert r.status_code == 400


def test_assessments_run_rejects_path_traversal_organization_id() -> None:
    """GET /api/v1/assessments/run with path characters in organization_id returns 400."""
    for bad_id in ["../evil", "org/001", "org\\002"]:
        r = client.get(
            "/api/v1/assessments/run",
            params={"organization_id": bad_id, "framework_ids": "gdpr"},
        )
        assert r.status_code == 400, f"Expected 400 for organization_id={bad_id!r}"
        assert "invalid" in r.json()["detail"].lower() or "path" in r.json()["detail"].lower()


def test_assessments_run_accepts_valid_org_and_streams() -> None:
    """GET /api/v1/assessments/run with valid params returns 200 and SSE stream (requires sqlalchemy)."""
    pytest.importorskip("sqlalchemy")
    r = client.get(
        "/api/v1/assessments/run",
        params={"organization_id": "demo-org-001", "framework_ids": "gdpr"},
    )
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")
    # Consume at least a few lines to trigger stream
    lines = r.iter_lines()
    count = 0
    for line in lines:
        count += 1
        if count >= 5:
            break
    assert count >= 1
