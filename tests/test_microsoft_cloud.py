# tests/test_microsoft_cloud.py — Microsoft 365 mock sync API and adapter.

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from core.security import create_access_token
from app.connectors.microsoft.mock_adapter import (
    _mock_findings,
    is_m365_mock_mode,
    run_microsoft365_sync,
)


@pytest.fixture(scope="session")
def postgres_reachable() -> bool:
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
def m365_auth_headers() -> dict[str, str]:
    token = create_access_token(
        {
            "sub": "m365-test@cortex.local",
            "email": "m365-test@cortex.local",
            "org_id": "demo-org-001",
            "role": "admin",
            "is_demo": True,
        }
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def skip_if_no_postgres(postgres_reachable: bool) -> None:
    if not postgres_reachable:
        pytest.skip("Postgres not reachable")


def test_mock_findings_count() -> None:
    rows = _mock_findings("sync-1", "demo-org-001")
    assert len(rows) == 6
    assert rows[0].framework_controls.get("iso27001-2022")


@pytest.mark.asyncio
async def test_run_microsoft365_sync_mock() -> None:
    if not is_m365_mock_mode():
        pytest.skip("CORTEX_M365_MOCK disabled")
    sync_id, findings, mock = await run_microsoft365_sync("demo-org-001")
    assert mock is True
    assert len(findings) >= 1
    assert sync_id.startswith("m365-sync-")


def test_m365_sync_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/api/v1/integrations/microsoft-365/sync",
        json={"org_id": "demo-org-001"},
    )
    assert r.status_code == 401


def test_m365_sync_and_findings(
    client: TestClient,
    m365_auth_headers: dict[str, str],
    postgres_reachable: bool,
) -> None:
    if not postgres_reachable:
        pytest.skip("Postgres not reachable")
    r = client.post(
        "/api/v1/integrations/microsoft-365/sync",
        json={"org_id": "demo-org-001"},
        headers=m365_auth_headers,
    )
    if r.status_code in (400, 500) and "migration" in (r.text or "").lower():
        pytest.skip("Microsoft tables not migrated")
    assert r.status_code == 200
    data = r.json()
    assert data["findings_count"] >= 6
    assert data["evidence_created"] >= 1
    assert data["mock_mode"] is True

    st = client.get(
        "/api/v1/integrations/microsoft-365/status?org_id=demo-org-001",
        headers=m365_auth_headers,
    )
    assert st.status_code == 200
    assert st.json().get("connected") is True

    findings = client.get(
        "/api/v1/integrations/microsoft-365/findings?org_id=demo-org-001",
        headers=m365_auth_headers,
    )
    assert findings.status_code == 200
    assert findings.json()["total"] >= 6
