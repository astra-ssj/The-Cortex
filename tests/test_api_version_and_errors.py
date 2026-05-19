# tests/test_api_version_and_errors.py — /api/v1 enforcement and error envelope.

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_unversioned_api_path_returns_404_envelope(client: TestClient) -> None:
    """Paths under /api/ must use /api/v1 (middleware)."""
    r = client.get("/api/frameworks")
    assert r.status_code == 404
    data = r.json()
    assert data["error"]["code"] == "NOT_FOUND"
    assert "error" in data
    assert "message" in data["error"]


def test_readiness_uses_envelope_when_database_unavailable(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /ready returns 503 with { error: { code, message } } when database_ready is false."""

    async def _not_ready() -> bool:
        return False

    import api.main as main_mod

    monkeypatch.setattr(main_mod, "database_ready", _not_ready)
    r = client.get("/ready")
    assert r.status_code == 503
    j = r.json()
    assert j["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert "message" in j["error"]


def test_frameworks_list_is_paginated_envelope(client: TestClient, auth_headers: dict[str, str]) -> None:
    """GET /api/v1/frameworks returns { items, total, offset, limit }."""
    r = client.get("/api/v1/frameworks", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "offset" in data
    assert "limit" in data
    assert isinstance(data["items"], list)
