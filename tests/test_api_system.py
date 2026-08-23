# tests/test_api_system.py — GET /api/v1/system/ztaip-status.

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

def test_ztaip_status_returns_200(client: TestClient) -> None:
    """GET /api/v1/system/ztaip-status returns ZTAIPStatus."""
    r = client.get("/api/v1/system/ztaip-status")
    assert r.status_code == 200
    data = r.json()
    assert "auditFabric" in data
    assert "circuitBreakersCount" in data
    assert "humanReviewQueueCount" in data
    assert "sovereigntyBroker" in data
    assert "agentCertificatesCount" in data


def test_ztaip_status_audit_fabric_shape(client: TestClient) -> None:
    """auditFabric has totalEvents and lastEventAt (read from audit_fabric)."""
    r = client.get("/api/v1/system/ztaip-status")
    assert r.status_code == 200
    af = r.json()["auditFabric"]
    assert "totalEvents" in af
    assert "lastEventAt" in af
    assert isinstance(af["totalEvents"], int)
    assert af["totalEvents"] >= 0


def test_system_ready_returns_200_when_database_available(
    client: TestClient,
    postgres_reachable: bool,
) -> None:
    """GET /api/v1/system/ready succeeds when Postgres is reachable."""
    if not postgres_reachable:
        pytest.skip("database not reachable")
    r = client.get("/api/v1/system/ready")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ready"
    assert data.get("database") == "ok"


def test_root_ready_returns_200_when_database_available(
    client: TestClient,
    postgres_reachable: bool,
) -> None:
    """GET /ready matches /api/v1/system/ready semantics."""
    if not postgres_reachable:
        pytest.skip("database not reachable")
    r = client.get("/ready")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ready"
    assert data.get("database") == "ok"


def test_ztaip_status_circuit_breakers_count(client: TestClient) -> None:
    """circuitBreakersCount is read from real circuit breaker registry."""
    r = client.get("/api/v1/system/ztaip-status")
    assert r.status_code == 200
    assert isinstance(r.json()["circuitBreakersCount"], int)
    assert r.json()["circuitBreakersCount"] >= 1  # at least assessment_llm breaker


def test_llm_providers_returns_chain(client: TestClient) -> None:
    """GET /api/v1/system/llm-providers exposes provider chain without secrets."""
    r = client.get("/api/v1/system/llm-providers")
    assert r.status_code == 200
    data = r.json()
    assert "chain" in data
    assert "active_chain" in data
    assert "providers" in data
    assert "stub" in data["providers"]
    stub = data["providers"]["stub"]
    assert stub.get("configured") is True
    assert "apiKeySet" not in stub or stub.get("apiKeySet") is not True


def test_agent_status_requires_auth(client: TestClient) -> None:
    """GET /api/v1/system/agent-status is not public (unlike ztaip-status)."""
    r = client.get("/api/v1/system/agent-status")
    assert r.status_code == 401


def test_agent_status_returns_provider(
    client: TestClient,
    auth_headers: dict[str, str],
    postgres_reachable: bool,
) -> None:
    """Authenticated callers see provider, model, and breaker_open."""
    if not postgres_reachable:
        pytest.skip("database not reachable")
    r = client.get("/api/v1/system/agent-status", headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["provider"] in ("stub", "anthropic", "ollama")
    assert isinstance(data["model"], str) and data["model"]
    assert isinstance(data["breaker_open"], bool)
