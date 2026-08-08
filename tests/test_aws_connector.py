# tests/test_aws_connector.py — AWS connector and API with mocked boto3 (moto). No real credentials.

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

try:
    from moto import mock_aws
    HAS_MOTO = True
except ImportError:
    HAS_MOTO = False

    def mock_aws(f):  # no-op when moto not installed
        return f

from api.main import app
from ontology.models import ControlFinding, ControlRef, Evidence, Finding, SystemAsset

from core.connectors.aws import AWSConnector
from core.connectors.aws.aws_evidence import create_evidence_from_control_findings
from core.connectors.azure.credential_store import clear_credentials, get_credentials, store_credentials

client = TestClient(app)

CONNECTOR_ID = "aws"


@pytest.fixture(autouse=True)
def _clear_aws_credentials():
    clear_credentials(CONNECTOR_ID)
    yield
    clear_credentials(CONNECTOR_ID)


# ---- AWSConnector with moto (skipped when moto not installed) ----
@pytest.mark.skipif(not HAS_MOTO, reason="moto not installed (pip install 'moto[aws]')")
@mock_aws
def test_aws_connector_connect_moto() -> None:
    """Connect validates credentials via STS get_caller_identity (moto)."""
    async def run() -> None:
        conn = AWSConnector(
            account_id="123456789012",
            access_key_id="testing",
            secret_access_key="testing",
            region="us-east-1",
        )
        await conn.connect()

    asyncio.run(run())


@pytest.mark.skipif(not HAS_MOTO, reason="moto not installed (pip install 'moto[aws]')")
@mock_aws
def test_aws_connector_connect_account_mismatch() -> None:
    """Connect raises when account_id does not match STS identity."""
    async def run() -> None:
        conn = AWSConnector(
            account_id="999999999999",
            access_key_id="testing",
            secret_access_key="testing",
            region="us-east-1",
        )
        with pytest.raises(ValueError, match="Account mismatch"):
            await conn.connect()

    asyncio.run(run())


@pytest.mark.skipif(not HAS_MOTO, reason="moto not installed (pip install 'moto[aws]')")
@mock_aws
def test_aws_connector_discover_systems_moto() -> None:
    """discover_systems returns List[SystemAsset] from EC2/S3/Lambda (moto)."""
    import boto3

    # Create a few resources so discover_systems has something to find
    ec2 = boto3.client("ec2", region_name="us-east-1")
    ec2.run_instances(ImageId="ami-12345678", MinCount=1, MaxCount=1)
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="test-bucket-cortex")

    async def run() -> None:
        conn = AWSConnector(
            account_id="123456789012",
            access_key_id="testing",
            secret_access_key="testing",
            region="us-east-1",
        )
        systems = await conn.discover_systems()
        assert isinstance(systems, list)
        assert all(isinstance(s, SystemAsset) for s in systems)
        types = {s.system_type for s in systems}
        assert "infrastructure" in types or "data_store" in types or "application" in types

    asyncio.run(run())


@pytest.mark.skipif(not HAS_MOTO, reason="moto not installed (pip install 'moto[aws]')")
def test_aws_connector_discover_controls_returns_list() -> None:
    """discover_controls returns List[ControlFinding] (moto for Config/CloudTrail/GuardDuty/IAM)."""
    @mock_aws
    def _run() -> None:
        async def go() -> None:
            conn = AWSConnector(
                account_id="123456789012",
                access_key_id="testing",
                secret_access_key="testing",
                region="us-east-1",
            )
            controls = await conn.discover_controls()
            assert isinstance(controls, list)
            assert all(isinstance(c, ControlFinding) for c in controls)

        asyncio.run(go())

    _run()


@pytest.mark.skipif(not HAS_MOTO, reason="moto not installed (pip install 'moto[aws]')")
def test_aws_connector_pull_findings_returns_list() -> None:
    """pull_findings returns List[Finding] (moto for Security Hub)."""
    @mock_aws
    def _run() -> None:
        async def go() -> None:
            conn = AWSConnector(
                account_id="123456789012",
                access_key_id="testing",
                secret_access_key="testing",
                region="us-east-1",
            )
            findings = await conn.pull_findings()
            assert isinstance(findings, list)
            assert all(isinstance(f, Finding) for f in findings)

        asyncio.run(go())

    _run()


@pytest.mark.skipif(not HAS_MOTO, reason="moto not installed (pip install 'moto[aws]')")
def test_aws_connector_get_identity_summary_returns_dict() -> None:
    """get_identity_summary returns dict with users_without_mfa, root_usage_last_90_days, stale_access_keys_90_days."""
    @mock_aws
    def _run() -> None:
        async def go() -> None:
            conn = AWSConnector(
                account_id="123456789012",
                access_key_id="testing",
                secret_access_key="testing",
                region="us-east-1",
            )
            summary = await conn.get_identity_summary()
            assert "users_without_mfa" in summary
            assert "root_usage_last_90_days" in summary
            assert "stale_access_keys_90_days" in summary

        asyncio.run(go())

    _run()


# ---- aws_evidence ----
def test_create_evidence_from_control_findings_aws() -> None:
    """Evidence has evidence_type AUTOMATED_SCAN, collector AI_AGENT, obligations_satisfied from control_refs."""
    findings = [
        ControlFinding(
            control_ref=ControlRef(framework_id="aws", control_id="cloudtrail-enabled"),
            status="compliant",
            recommendation_id="cloudtrail-enabled",
        ),
        ControlFinding(
            control_ref=ControlRef(framework_id="aws", control_id="guardduty-enabled"),
            status="compliant",
            recommendation_id="guardduty-enabled",
        ),
        ControlFinding(
            control_ref=ControlRef(framework_id="aws", control_id="s3-public"),
            status="non_compliant",
            recommendation_id="s3-public",
        ),
    ]
    evidence_list = create_evidence_from_control_findings(findings, security_score=0.9)
    assert len(evidence_list) >= 1
    ev = evidence_list[0]
    assert isinstance(ev, Evidence)
    assert ev.evidence_type == "AUTOMATED_SCAN"
    assert ev.collector == "AI_AGENT"
    assert ev.confidence_score == 0.9
    assert any("aws-cloudtrail-enabled" in o or "cloudtrail" in o for o in ev.obligations_satisfied)


def test_create_evidence_from_control_findings_empty_when_no_compliant() -> None:
    """When no compliant findings, evidence list is empty."""
    findings = [
        ControlFinding(
            control_ref=ControlRef(framework_id="aws", control_id="x"),
            status="non_compliant",
            recommendation_id="x",
        ),
    ]
    evidence_list = create_evidence_from_control_findings(findings, security_score=0.9)
    assert len(evidence_list) == 0


# ---- API (mocked connector) ----
@patch("api.connectors_aws.AWSConnector")
def test_post_connectors_aws_connect_mock(mock_connector_class: MagicMock) -> None:
    """POST /api/v1/connectors/aws/connect returns systems_found, controls_assessed, findings_created."""
    mock_conn = MagicMock()
    mock_conn.connect = AsyncMock(return_value=True)
    mock_conn.discover_systems = AsyncMock(
        return_value=[
            SystemAsset(
                jurisdiction="internal",
                purpose_tags=[],
                id="1",
                name="ec2-instance",
                system_type="infrastructure",
            )
        ],
    )
    mock_conn.discover_controls = AsyncMock(
        return_value=[
            ControlFinding(
                control_ref=ControlRef(framework_id="aws", control_id="cloudtrail-enabled"),
                status="compliant",
            )
        ],
    )
    mock_conn.pull_findings = AsyncMock(
        return_value=[
            Finding(
                id="f1",
                title="MFA",
                severity="High",
                source="security_hub",
            )
        ],
    )
    mock_connector_class.return_value = mock_conn

    r = client.post(
        "/api/v1/connectors/aws/connect",
        json={
            "account_id": "123456789012",
            "access_key_id": "AKIAIOSFODNN7EXAMPLE",
            "secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            "region": "us-east-1",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["systems_found"] == 1
    assert data["controls_assessed"] == 1
    assert data["findings_created"] == 1
    assert "evidence_created" in data


@patch("core.connectors.aws.aws_connector.create_connector_from_store")
def test_post_connectors_aws_sync_stream_mock(mock_create: MagicMock) -> None:
    """POST /api/v1/connectors/aws/sync returns SSE stream with progress/done."""
    mock_conn = MagicMock()
    mock_conn.connect = AsyncMock(return_value=True)
    mock_conn.discover_systems = AsyncMock(return_value=[])
    mock_conn.discover_controls = AsyncMock(return_value=[])
    mock_conn.pull_findings = AsyncMock(return_value=[])
    mock_create.return_value = mock_conn

    r = client.post("/api/v1/connectors/aws/sync")
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")
    text = r.text
    assert "event: progress" in text
    assert "event: done" in text or "event: summary" in text


@patch("core.connectors.aws.aws_connector.create_connector_from_store")
def test_post_connectors_aws_sync_no_credentials_mock(mock_create: MagicMock) -> None:
    """POST /api/v1/connectors/aws/sync returns error event when no stored credentials."""
    mock_create.return_value = None
    r = client.post("/api/v1/connectors/aws/sync")
    assert r.status_code == 200
    assert "event: error" in r.text
    assert "No stored credentials" in r.text


# ---- credential_store (AWS uses same store as Azure, keyed by connector_id) ----
def test_aws_credential_store_roundtrip() -> None:
    """Store and get AWS credentials under connector_id aws."""
    clear_credentials(CONNECTOR_ID)
    store_credentials(
        CONNECTOR_ID,
        {
            "account_id": "123456789012",
            "access_key_id": "AKIAIOSFODNN7EXAMPLE",
            "secret_access_key": "secret",
            "region": "us-east-1",
        },
    )
    out = get_credentials(CONNECTOR_ID)
    assert out is not None
    assert out.get("account_id") == "123456789012"
    assert out.get("region") == "us-east-1"
    clear_credentials(CONNECTOR_ID)
    assert get_credentials(CONNECTOR_ID) is None
