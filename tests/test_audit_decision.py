# tests/test_audit_decision.py — Tests for high-throughput partitioned Redis streams ingestion.

from __future__ import annotations

import json
import sys
import uuid
from unittest.mock import AsyncMock

import mmh3
import pytest
import redis.exceptions
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.audit_decision import (
    AuditDecisionPayload,
    DecisionEventPayload,
    get_redis_client,
    router as audit_decision_router,
)


@pytest.fixture
def mock_redis() -> AsyncMock:
    redis = AsyncMock()
    redis.xadd = AsyncMock(return_value="1729000000000-0")
    return redis


@pytest.fixture
def test_client(mock_redis: AsyncMock) -> TestClient:
    app = FastAPI()
    app.include_router(audit_decision_router)
    app.dependency_overrides[get_redis_client] = lambda: mock_redis
    return TestClient(app)


def test_no_sqlalchemy_or_asyncpg_imported():
    """Verify strictly decoupled constraint: endpoint module must NOT import SQLAlchemy or asyncpg."""
    import subprocess

    cmd = [
        sys.executable,
        "-c",
        "import api.audit_decision, sys; "
        "forbidden = [m for m in sys.modules if 'sqlalchemy' in m or 'asyncpg' in m]; "
        "assert not forbidden, f'Forbidden: {forbidden}'",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    assert res.returncode == 0, res.stderr


def test_partitioning_logic_determinism():
    """Verify mmh3 unsigned hash modulo 64 guarantees determinism across tenants."""
    tenant_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())

    expected_p_a = mmh3.hash(tenant_a, signed=False) % 64
    expected_p_b = mmh3.hash(tenant_b, signed=False) % 64

    assert 0 <= expected_p_a < 64
    assert 0 <= expected_p_b < 64

    # Repeated calls must produce the exact same partition
    for _ in range(10):
        assert mmh3.hash(tenant_a, signed=False) % 64 == expected_p_a
        assert mmh3.hash(tenant_b, signed=False) % 64 == expected_p_b


def test_post_decision_returns_202_accepted(test_client: TestClient, mock_redis: AsyncMock):
    """POST /api/audit/decision returns HTTP 202 Accepted and appends to Redis stream."""
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    action_data = {"decision": "grant_least_privilege", "resource": "k8s-prod", "risk_score": 12}

    partition_id = mmh3.hash(tenant_id, signed=False) % 64
    expected_stream_key = f"audit_stream:partition_{partition_id}"

    response = test_client.post(
        "/api/audit/decision",
        json={
            "tenant_id": tenant_id,
            "user_id": user_id,
            "action_data": action_data,
        },
    )

    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "accepted"
    assert data["stream_key"] == expected_stream_key
    assert data["partition"] == partition_id
    assert data["event_id"] == "1729000000000-0"

    # Verify Redis xadd call arguments
    mock_redis.xadd.assert_awaited_once()
    call_args, call_kwargs = mock_redis.xadd.call_args
    assert call_args[0] == expected_stream_key
    assert call_kwargs.get("maxlen") == 100000

    payload_passed = call_args[1]
    assert payload_passed["tenant_id"] == tenant_id
    assert payload_passed["user_id"] == user_id
    assert payload_passed["action_data"] == json.dumps(action_data)
    # Ensure every single value in the stream payload is a string
    assert all(isinstance(v, str) for v in payload_passed.values())


def test_post_decision_validation_errors(test_client: TestClient):
    """Missing required fields return 422 Unprocessable Entity."""
    response = test_client.post(
        "/api/audit/decision",
        json={"tenant_id": str(uuid.uuid4())},  # missing user_id and action_data
    )
    assert response.status_code == 422


def test_redis_connection_error_returns_503(test_client: TestClient, mock_redis: AsyncMock):
    """Redis connection failure returns HTTP 503 Service Unavailable."""
    mock_redis.xadd.side_effect = redis.exceptions.ConnectionError("Failed to connect to Redis on localhost:6379")

    response = test_client.post(
        "/api/audit/decision",
        json={
            "tenant_id": str(uuid.uuid4()),
            "user_id": str(uuid.uuid4()),
            "action_data": {"action": "deny"},
        },
    )

    assert response.status_code == 503
    assert "Redis connection error" in response.json()["detail"]


def test_redis_timeout_error_returns_503(test_client: TestClient, mock_redis: AsyncMock):
    """Redis timeout error returns HTTP 503 Service Unavailable."""
    mock_redis.xadd.side_effect = redis.exceptions.TimeoutError("Redis socket read timeout")

    response = test_client.post(
        "/api/audit/decision",
        json={
            "tenant_id": str(uuid.uuid4()),
            "user_id": str(uuid.uuid4()),
            "action_data": {"action": "isolate_host"},
        },
    )

    assert response.status_code == 503
    assert "Redis connection error" in response.json()["detail"]


def test_pydantic_schema_aliases():
    """Verify aliases and model properties."""
    t_id = uuid.uuid4()
    u_id = uuid.uuid4()
    payload = AuditDecisionPayload(tenant_id=t_id, user_id=u_id, action_data={"k": "v"})
    assert isinstance(payload, DecisionEventPayload)
    assert str(payload.tenant_id) == str(t_id)
    assert str(payload.user_id) == str(u_id)
    assert payload.action_data == {"k": "v"}


def test_cortex_main_app_integration(mock_redis: AsyncMock):
    """Verify POST /api/audit/decision works end-to-end on CORTEX main app."""
    from api.main import app as main_app

    main_app.dependency_overrides[get_redis_client] = lambda: mock_redis
    client = TestClient(main_app)

    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    action_data = {"event": "review_approved", "actor_role": "DPO"}

    r = client.post(
        "/api/audit/decision",
        json={
            "tenant_id": tenant_id,
            "user_id": user_id,
            "action_data": action_data,
        },
    )

    assert r.status_code == 202
    res_data = r.json()
    assert res_data["status"] == "accepted"
    expected_partition = mmh3.hash(tenant_id, signed=False) % 64
    assert res_data["partition"] == expected_partition
    assert res_data["stream_key"] == f"audit_stream:partition_{expected_partition}"

    # Clean up override
    main_app.dependency_overrides.pop(get_redis_client, None)

