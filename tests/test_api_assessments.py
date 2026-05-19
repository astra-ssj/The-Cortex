# tests/test_api_assessments.py — GET /api/v1/assessments/run (SSE) and input validation.

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def _response_message(data: dict) -> str:
    err = data.get("error")
    if isinstance(err, dict) and err.get("message"):
        return str(err["message"])
    d = data.get("detail")
    if isinstance(d, str):
        return d
    return ""


def test_assessments_run_rejects_empty_organization_id(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /api/v1/assessments/run with empty organization_id returns 400."""
    r = client.get(
        "/api/v1/assessments/run",
        params={"organization_id": "", "framework_ids": "gdpr-2016-679"},
        headers=auth_headers,
    )
    assert r.status_code == 400
    msg = _response_message(r.json())
    assert "required" in msg.lower() or "empty" in msg.lower()


def test_assessments_run_rejects_whitespace_organization_id(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /api/v1/assessments/run with whitespace-only organization_id returns 400."""
    r = client.get(
        "/api/v1/assessments/run",
        params={"organization_id": "   ", "framework_ids": "gdpr-2016-679"},
        headers=auth_headers,
    )
    assert r.status_code == 400


def test_assessments_run_rejects_path_traversal_organization_id(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    """GET /api/v1/assessments/run with path characters in organization_id returns 400."""
    for bad_id in ["../evil", "org/001", "org\\002"]:
        r = client.get(
            "/api/v1/assessments/run",
            params={"organization_id": bad_id, "framework_ids": "gdpr-2016-679"},
            headers=auth_headers,
        )
        assert r.status_code == 400, f"Expected 400 for organization_id={bad_id!r}"
        msg = _response_message(r.json())
        assert "invalid" in msg.lower() or "path" in msg.lower()


def test_assessments_run_accepts_valid_org_and_streams(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /api/v1/assessments/run with valid params returns 200 and SSE stream (requires sqlalchemy)."""
    pytest.importorskip("sqlalchemy")
    r = client.get(
        "/api/v1/assessments/run",
        params={"organization_id": "demo-org-001", "framework_ids": "gdpr-2016-679"},
        headers=auth_headers,
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


def test_review_queue_demo_has_eight_pending(
    client: TestClient,
    auth_headers: dict[str, str],
    postgres_reachable: bool,
) -> None:
    """Human review queue seeds eight items for demo-org when Postgres + migration 006 exist."""
    if not postgres_reachable:
        pytest.skip("database not reachable")
    r = client.get("/api/v1/assessments/review-queue", headers=auth_headers)
    if r.status_code == 503:
        pytest.skip("human_review schema not applied")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data["items"], list)
    assert isinstance(data["reviewed"], list)
    assert len(data["items"]) == 8
