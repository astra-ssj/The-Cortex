# tests/test_rbac.py — Server-side RBAC enforcement.

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import make_auth_headers


def test_viewer_cannot_patch_finding(client: TestClient) -> None:
    headers = make_auth_headers("viewer")
    r = client.patch(
        "/api/v1/findings/finding-001",
        json={"status": "OPEN"},
        headers=headers,
    )
    assert r.status_code == 403
    msg = (r.json().get("error") or {}).get("message") or r.json().get("detail") or ""
    assert "edit_findings" in str(msg) or "Permission denied" in str(msg)


def test_analyst_can_patch_finding(client: TestClient, analyst_headers: dict[str, str]) -> None:
    r = client.get("/api/v1/findings", headers=analyst_headers)
    assert r.status_code == 200
    items = r.json()["items"]
    fid = items[0]["id"]
    original = items[0]["status"]
    new_status = "IN_PROGRESS" if original == "OPEN" else "OPEN"
    r2 = client.patch(
        f"/api/v1/findings/{fid}",
        json={"status": new_status},
        headers=analyst_headers,
    )
    assert r2.status_code == 200
    client.patch(f"/api/v1/findings/{fid}", json={"status": original}, headers=analyst_headers)


def test_viewer_cannot_approve_review(client: TestClient, viewer_headers: dict[str, str]) -> None:
    r = client.post(
        "/api/v1/assessments/controls/review-1/approve",
        json={"notes": "Attempted approve by viewer role in pytest."},
        headers=viewer_headers,
    )
    assert r.status_code == 403


def test_analyst_cannot_override_review(client: TestClient, analyst_headers: dict[str, str]) -> None:
    r = client.post(
        "/api/v1/assessments/controls/review-1/override",
        json={
            "assessment": "COMPLIANT",
            "justification": "Analyst override attempt with sufficient length for validation.",
        },
        headers=analyst_headers,
    )
    assert r.status_code == 403


def test_ingest_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/api/v1/ingest/document",
        files={"file": ("x.txt", b"policy text", "text/plain")},
    )
    assert r.status_code == 401


def test_viewer_cannot_ingest(client: TestClient, viewer_headers: dict[str, str]) -> None:
    r = client.post(
        "/api/v1/ingest/document",
        files={"file": ("x.txt", b"policy text", "text/plain")},
        headers=viewer_headers,
    )
    assert r.status_code == 403


def test_analyst_can_ingest(client: TestClient, analyst_headers: dict[str, str]) -> None:
    r = client.post(
        "/api/v1/ingest/document",
        files={"file": ("x.txt", b"Lawful basis for processing personal data.", "text/plain")},
        headers=analyst_headers,
    )
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")
