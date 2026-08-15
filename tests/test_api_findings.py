# tests/test_api_findings.py — GET /api/v1/findings and PATCH /api/v1/findings/{id}.
#
# These used to assert twelve seeded rows. Control Gaps is now backed by the
# Postgres `findings` table and filled by learner action, so the count is not
# fixed and each test seeds the row it needs (see the `manual_finding` fixture).
# Competency-derived gaps are covered separately in test_gaps_from_competency.py.

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient


def _findings_items(payload: dict[str, Any] | list[Any]) -> list[dict[str, Any]]:
    """List endpoint returns paginated ``{ items, total, offset, limit }``."""
    if isinstance(payload, list):
        return payload
    items = payload.get("items")
    return items if isinstance(items, list) else []


def test_list_findings_is_paginated_and_includes_seeded_row(
    client: TestClient,
    auth_headers: dict[str, str],
    manual_finding: str,
) -> None:
    r = client.get("/api/v1/findings", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert {"items", "total", "offset", "limit"} <= set(data)
    items = _findings_items(data)
    assert data["total"] >= 1
    assert manual_finding in {f["id"] for f in items}


def test_list_findings_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/findings")
    assert r.status_code in (401, 403)


def test_list_findings_filter_by_status(
    client: TestClient,
    auth_headers: dict[str, str],
    manual_finding: str,
) -> None:
    r = client.get("/api/v1/findings", params={"status": "OPEN"}, headers=auth_headers)
    assert r.status_code == 200
    items = _findings_items(r.json())
    assert all(f["status"] == "OPEN" for f in items)
    assert manual_finding in {f["id"] for f in items}


def test_get_finding_by_id(
    client: TestClient,
    auth_headers: dict[str, str],
    manual_finding: str,
) -> None:
    r = client.get(f"/api/v1/findings/{manual_finding}", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == manual_finding
    assert body["control_id"] == "A.8.8"
    assert body["actions"] == ["Procure a provider", "Scope the test"]
    assert body["source"] == "manual"
    # Derived rather than stored: a persisted counter is stale the next day.
    assert body["days_open"] == 0


def test_get_finding_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.get("/api/v1/findings/does-not-exist-xyz", headers=auth_headers)
    assert r.status_code == 404


def test_list_findings_filter_by_severity(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    r = client.get("/api/v1/findings", params={"severity": "CRITICAL"}, headers=auth_headers)
    assert r.status_code == 200
    items = _findings_items(r.json())
    assert all(f["severity"] == "CRITICAL" for f in items)


def test_update_finding_status_persists(
    client: TestClient,
    auth_headers: dict[str, str],
    manual_finding: str,
) -> None:
    patched = client.patch(
        f"/api/v1/findings/{manual_finding}",
        json={"status": "IN_PROGRESS", "owner": "Security Lead", "note_append": "Provider shortlisted."},
        headers=auth_headers,
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["status"] == "IN_PROGRESS"
    assert body["owner"] == "Security Lead"
    assert body["notes"][0]["text"] == "Provider shortlisted."
    assert body["notes"][0]["timestamp"], "note must be timestamped for the audit trail"

    # Re-read rather than trusting the response: the point of this change is that
    # the update reaches Postgres instead of a process-local list.
    reread = client.get(f"/api/v1/findings/{manual_finding}", headers=auth_headers)
    assert reread.status_code == 200
    assert reread.json()["status"] == "IN_PROGRESS"


def test_manual_finding_can_be_closed_by_hand(
    client: TestClient,
    auth_headers: dict[str, str],
    manual_finding: str,
) -> None:
    """Only competency-derived gaps require a retake; authored ones do not."""
    r = client.patch(
        f"/api/v1/findings/{manual_finding}",
        json={"status": "REMEDIATED"},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "REMEDIATED"


def test_update_finding_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.patch(
        "/api/v1/findings/nonexistent-id-999",
        json={"status": "OPEN"},
        headers=auth_headers,
    )
    assert r.status_code == 404
