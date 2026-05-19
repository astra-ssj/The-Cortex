# tests/test_api_shasta_cloud.py — Shasta cloud scan API (async enqueue + polling contract).

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from core.security import create_access_token


@pytest.fixture(scope="session")
def postgres_reachable() -> bool:
    """One-shot DB probe before any TestClient runs — avoids async engine / loop conflicts later."""
    from db.session import database_ready

    try:
        return asyncio.run(database_ready())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(database_ready())
        finally:
            loop.close()
            asyncio.set_event_loop(None)


@pytest.fixture
def shasta_auth_headers() -> dict[str, str]:
    """JWT with org scope — avoids POST /auth/token (which touches Postgres)."""
    token = create_access_token(
        {
            "sub": "shasta-api-test@cortex.local",
            "email": "shasta-api-test@cortex.local",
            "org_id": "demo-org-001",
            "role": "ciso",
        }
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def skip_if_no_postgres(postgres_reachable: bool) -> None:
    if not postgres_reachable:
        pytest.skip(
            "Postgres not reachable — set DATABASE_URL and apply schema (see scripts/verify_shasta_stack.sh)"
        )


def test_post_shasta_scan_501_when_not_installed(
    client: TestClient,
    shasta_auth_headers: dict[str, str],
    skip_if_no_postgres: None,
) -> None:
    """Missing optional extra → 501 before any scan row is created."""
    with patch(
        "app.connectors.shasta.shasta_adapter.is_shasta_installed",
        return_value=False,
    ):
        r = client.post(
            "/api/v1/shasta/scans",
            json={"cloud": "aws", "org_id": "demo-org-001"},
            headers=shasta_auth_headers,
        )
    assert r.status_code == 501
    data = r.json()
    msg = (data.get("error") or {}).get("message") or data.get("detail") or ""
    assert "shasta-scan" in str(msg).lower()


@patch("api.shasta_cloud._run_shasta_scan_background", new_callable=AsyncMock)
@patch("api.shasta_cloud._create_running_scan_row", new_callable=AsyncMock)
@patch(
    "app.connectors.shasta.shasta_adapter.is_shasta_installed",
    return_value=True,
)
def test_post_shasta_scan_returns_running_immediately(
    _mock_installed: bool,
    mock_create: AsyncMock,
    mock_bg: AsyncMock,
    client: TestClient,
    shasta_auth_headers: dict[str, str],
    skip_if_no_postgres: None,
) -> None:
    """POST must return quickly with ``running``; worker is scheduled separately."""
    rid = uuid.uuid4()
    mock_create.return_value = rid
    r = client.post(
        "/api/v1/shasta/scans",
        json={"cloud": "aws", "org_id": "demo-org-001"},
        headers=shasta_auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "running"
    assert body["scan_run_id"] == str(rid)
    assert body["org_id"] == "demo-org-001"
    mock_create.assert_awaited_once()
    mock_bg.assert_called_once()


def test_get_shasta_contract_unauthenticated(client: TestClient) -> None:
    """Canonical contract endpoint stays public (no JWT)."""
    r = client.get("/api/v1/shasta/contract")
    assert r.status_code == 200
    assert r.json().get("sqlite_not_sot") is True


"""
Manual verification (local):

1. **Happy path:** ``export PYTHONPATH=".:services/compliance-engine"``, apply ``migrations/009_shasta_cloud.sql``,
   run uvicorn, store connector creds, POST ``/api/v1/shasta/scans`` → immediate ``running``;
   poll GET ``/api/v1/shasta/scans?org_id=...`` until ``completed``; GET findings lists populate.

2. **Missing creds:** POST scan → row moves to ``failed`` with error text (not Shasta SQLite).

3. **Shasta not installed:** POST → **501** with install hint (no ``running`` row if 501 is returned before enqueue).

4. **Migration missing:** list/post may surface Postgres ``relation "shasta_scan_runs" does not exist`` — apply migration **009**.

End-to-end worker completion (running → completed) is not exercised in pytest: Starlette
``BackgroundTasks`` + SQLAlchemy async pools interact badly with TestClient/ASGITransport in the
same process. Use ``bash scripts/verify_shasta_stack.sh`` for schema + API unit coverage, then
manual POST + poll against a running uvicorn when validating the full job lifecycle.
"""
