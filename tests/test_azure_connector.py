# tests/test_azure_connector.py — Azure connector and API with mocked Azure SDK (no real credentials).

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from api.main import app
from ontology.models import ControlFinding, ControlRef, Evidence, Finding, SystemAsset

# Compliance-engine app (connectors)
from app.connectors.azure import AzureConnector
from app.connectors.azure.azure_evidence import create_evidence_from_control_findings
from app.connectors.azure.credential_store import clear_credentials, get_credentials, store_credentials

client = TestClient(app)

CONNECTOR_ID = "azure"


# ---- AzureConnector (mocked Azure SDK) ----


@pytest.fixture(autouse=True)
def _clear_azure_credentials():
    clear_credentials(CONNECTOR_ID)
    yield
    clear_credentials(CONNECTOR_ID)


@patch.object(AzureConnector, "_list_resources_sync", return_value=[])
def test_azure_connector_connect_mock(mock_list: MagicMock) -> None:
    """Connect validates credentials via mocked ARM list (no real Azure)."""
    async def run() -> None:
        conn = AzureConnector("tid", "cid", "secret", "subid")
        await conn.connect()

    asyncio.run(run())
    mock_list.assert_called()


@patch.object(AzureConnector, "_list_resources_sync")
def test_azure_connector_discover_systems_mock(mock_list: MagicMock) -> None:
    """discover_systems returns List[SystemAsset] from mocked ARM resources."""
    mock_list.return_value = [
        {"id": "/sub/rg/servers/sql1", "name": "sql1", "type": "Microsoft.Sql/servers", "location": "eastus", "tags": {}},
        {"id": "/sub/rg/vms/vm1", "name": "vm1", "type": "Microsoft.Compute/virtualMachines", "location": "eastus", "tags": {}},
    ]

    async def run() -> None:
        conn = AzureConnector("tid", "cid", "secret", "subid")
        systems = await conn.discover_systems()
        assert isinstance(systems, list)
        assert all(isinstance(s, SystemAsset) for s in systems)
        assert any(s.system_type == "data_store" for s in systems)
        assert any(s.system_type == "infrastructure" for s in systems)

    asyncio.run(run())


def test_azure_connector_discover_controls_returns_list() -> None:
    """discover_controls returns List[ControlFinding] (stub impl)."""
    conn = AzureConnector("t", "c", "s", "sub")
    controls = asyncio.run(conn.discover_controls())
    assert isinstance(controls, list)
    assert all(isinstance(c, ControlFinding) for c in controls)


def test_azure_connector_pull_findings_returns_list() -> None:
    """pull_findings returns List[Finding] (stub impl)."""
    conn = AzureConnector("t", "c", "s", "sub")
    findings = asyncio.run(conn.pull_findings())
    assert isinstance(findings, list)
    assert all(isinstance(f, Finding) for f in findings)


def test_azure_connector_get_identity_summary_returns_dict() -> None:
    """get_identity_summary returns dict with privileged_role_assignments, accounts_without_mfa, stale_accounts_90d."""
    conn = AzureConnector("t", "c", "s", "sub")
    summary = asyncio.run(conn.get_identity_summary())
    assert "privileged_role_assignments" in summary
    assert "accounts_without_mfa" in summary
    assert "stale_accounts_90d" in summary


# ---- azure_evidence ----


def test_create_evidence_from_control_findings() -> None:
    """Evidence has evidence_type AUTOMATED_SCAN, collector AI_AGENT, obligations_satisfied from control_refs."""
    findings = [
        ControlFinding(control_ref=ControlRef(framework_id="nis2", control_id="NIS2-RM-10"), status="compliant", recommendation_id="MFA"),
        ControlFinding(control_ref=ControlRef(framework_id="iso27001", control_id="A.8.4"), status="compliant", recommendation_id="MFA"),
        ControlFinding(control_ref=ControlRef(framework_id="gdpr", control_id="GDPR-SEC-01"), status="non_compliant", recommendation_id="X"),
    ]
    evidence_list = create_evidence_from_control_findings(findings, defender_score=0.9)
    assert len(evidence_list) >= 1
    ev = evidence_list[0]
    assert isinstance(ev, Evidence)
    assert ev.evidence_type == "AUTOMATED_SCAN"
    assert ev.collector == "AI_AGENT"
    assert ev.confidence_score == 0.9
    assert "nis2-NIS2-RM-10" in ev.obligations_satisfied
    assert "iso27001-A.8.4" in ev.obligations_satisfied
    assert "gdpr-GDPR-SEC-01" not in ev.obligations_satisfied


# ---- API (mocked connector) ----


@patch("app.api.v1.azure.AzureConnector")
def test_post_connectors_azure_connect_mock(mock_connector_class: MagicMock) -> None:
    """POST /api/v1/connectors/azure/connect returns systems_found, controls_assessed, findings_created."""
    mock_conn = MagicMock()
    mock_conn.connect = AsyncMock(return_value=True)
    mock_conn.discover_systems = AsyncMock(return_value=[SystemAsset(jurisdiction="internal", purpose_tags=[], id="1", name="vm1", system_type="infrastructure")])
    mock_conn.discover_controls = AsyncMock(return_value=[ControlFinding(control_ref=ControlRef(framework_id="nis2", control_id="NIS2-RM-10"), status="compliant")])
    mock_conn.pull_findings = AsyncMock(return_value=[Finding(id="f1", title="MFA", severity="High", source="defender_for_cloud")])
    mock_connector_class.return_value = mock_conn

    r = client.post(
        "/api/v1/connectors/azure/connect",
        json={
            "tenant_id": "tid",
            "client_id": "cid",
            "client_secret": "secret",
            "subscription_id": "subid",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["systems_found"] == 1
    assert data["controls_assessed"] == 1
    assert data["findings_created"] == 1
    assert "evidence_created" in data


@patch("app.connectors.azure.azure_connector.create_connector_from_store")
def test_post_connectors_azure_sync_stream_mock(mock_create: MagicMock) -> None:
    """POST /api/v1/connectors/azure/sync returns SSE stream with progress/done."""
    mock_conn = MagicMock()
    mock_conn.connect = AsyncMock(return_value=True)
    mock_conn.discover_systems = AsyncMock(return_value=[])
    mock_conn.discover_controls = AsyncMock(return_value=[])
    mock_conn.pull_findings = AsyncMock(return_value=[])
    mock_create.return_value = mock_conn

    r = client.post("/api/v1/connectors/azure/sync")
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")
    text = r.text
    assert "event: progress" in text
    assert "event: done" in text or "event: summary" in text


@patch("app.connectors.azure.azure_connector.create_connector_from_store")
def test_post_connectors_azure_sync_no_credentials_mock(mock_create: MagicMock) -> None:
    """POST /api/v1/connectors/azure/sync returns error event when no stored credentials."""
    mock_create.return_value = None
    r = client.post("/api/v1/connectors/azure/sync")
    assert r.status_code == 200
    assert "event: error" in r.text
    assert "No stored credentials" in r.text


# ---- credential_store ----


def test_credential_store_roundtrip() -> None:
    """Store and get credentials (no encryption key in env = base64 only)."""
    clear_credentials("test-conn")
    store_credentials("test-conn", {"tenant_id": "t", "client_secret": "s"})
    out = get_credentials("test-conn")
    assert out is not None
    assert out.get("tenant_id") == "t"
    assert out.get("client_secret") == "s"
    clear_credentials("test-conn")
    assert get_credentials("test-conn") is None
