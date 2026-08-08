# aws.py — POST /api/v1/connectors/aws/connect and /sync. Validate via STS, discovery, SSE for sync.

from __future__ import annotations

import json
from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.audit_fabric import audit_fabric
from core.connectors.aws import AWSConnector
from core.connectors.aws.aws_connector import store_connector_credentials
from core.connectors.aws.aws_evidence import create_evidence_from_control_findings

logger = structlog.get_logger()

router = APIRouter(prefix="/connectors/aws", tags=["aws-connector"])


class AWSConnectBody(BaseModel):
    account_id: str = Field(..., description="AWS account ID")
    access_key_id: str = Field(..., description="IAM access key ID")
    secret_access_key: str = Field(..., description="IAM secret access key")
    region: str = Field("us-east-1", description="AWS region")
    role_arn: Optional[str] = Field(None, description="Optional role ARN for assume_role")
    external_id: Optional[str] = Field(None, description="Optional external ID for assume_role")
    session_token: Optional[str] = Field(None, description="Optional STS session token (temporary creds)")


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/connect")
async def aws_connect(body: AWSConnectBody) -> dict:
    """
    Validate credentials via STS, run discovery, store credentials (encrypted) for sync.
    Return: systems_found, controls_assessed, findings_created.
    """
    audit_fabric.log(
        "aws_connect_start",
        entity_type="connector",
        entity_id="aws",
        payload={"account_id": body.account_id[:4] + "..." if len(body.account_id) > 4 else body.account_id},
    )
    connector = AWSConnector(
        account_id=body.account_id,
        access_key_id=body.access_key_id,
        secret_access_key=body.secret_access_key,
        region=body.region,
        role_arn=body.role_arn,
        external_id=body.external_id,
        session_token=body.session_token,
    )
    try:
        await connector.connect()
    except Exception as e:
        audit_fabric.log(
            "aws_connect_error",
            entity_type="connector",
            entity_id="aws",
            payload={"error": str(e)},
        )
        raise HTTPException(status_code=400, detail=f"AWS connection failed: {e}") from e
    store_connector_credentials(
        body.account_id,
        body.access_key_id,
        body.secret_access_key,
        body.region,
        role_arn=body.role_arn,
        external_id=body.external_id,
        session_token=body.session_token,
    )
    systems = await connector.discover_systems()
    controls = await connector.discover_controls()
    findings = await connector.pull_findings()
    evidence_list = create_evidence_from_control_findings(controls, security_score=0.85)
    audit_fabric.log(
        "aws_connect_done",
        entity_type="connector",
        entity_id="aws",
        payload={
            "systems_found": len(systems),
            "controls_assessed": len(controls),
            "findings_created": len(findings),
            "evidence_created": len(evidence_list),
        },
    )
    return {
        "systems_found": len(systems),
        "controls_assessed": len(controls),
        "findings_created": len(findings),
        "evidence_created": len(evidence_list),
    }


async def _run_sync_stream():
    """Re-run discovery with stored credentials; yield SSE progress."""
    from core.connectors.aws.aws_connector import create_connector_from_store

    audit_fabric.log("aws_sync_start", entity_type="connector", entity_id="aws")
    connector = create_connector_from_store()
    if not connector:
        yield _sse("error", {"message": "No stored credentials. Call POST /connect first."})
        audit_fabric.log("aws_sync_error", entity_type="connector", entity_id="aws", payload={"error": "no_credentials"})
        return
    try:
        yield _sse("progress", {"stage": "connect", "message": "Validating credentials"})
        await connector.connect()
        yield _sse("progress", {"stage": "systems", "message": "Discovering systems"})
        systems = await connector.discover_systems()
        yield _sse("systems", {"count": len(systems)})
        yield _sse("progress", {"stage": "controls", "message": "Assessing controls"})
        controls = await connector.discover_controls()
        yield _sse("controls", {"count": len(controls)})
        yield _sse("progress", {"stage": "findings", "message": "Pulling findings"})
        findings = await connector.pull_findings()
        yield _sse("findings", {"count": len(findings)})
        evidence_list = create_evidence_from_control_findings(controls, security_score=0.85)
        yield _sse("evidence", {"count": len(evidence_list)})
        yield _sse(
            "summary",
            {
                "systems_found": len(systems),
                "controls_assessed": len(controls),
                "findings_created": len(findings),
                "evidence_created": len(evidence_list),
            },
        )
        yield _sse("done", {})
        audit_fabric.log(
            "aws_sync_done",
            entity_type="connector",
            entity_id="aws",
            payload={"systems_found": len(systems), "evidence_created": len(evidence_list)},
        )
    except Exception as e:
        logger.exception("aws_sync_error", error=str(e))
        audit_fabric.log("aws_sync_error", entity_type="connector", entity_id="aws", payload={"error": str(e)})
        yield _sse("error", {"message": str(e)})


@router.post("/sync")
async def aws_sync() -> StreamingResponse:
    """Re-run discovery with stored credentials; stream progress via SSE (same pattern as assessments)."""
    return StreamingResponse(
        _run_sync_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/shasta-contract")
async def aws_shasta_contract() -> dict:
    """Shasta (Transilience) import contract; same as GET /connectors/shasta/contract scoped to AWS context."""
    from core.connectors.shasta.shasta_adapter import shasta_contract_payload

    return shasta_contract_payload("aws")


@router.post("/shasta-scan")
async def aws_shasta_scan_removed() -> dict:
    """Removed: use POST /api/v1/shasta/scans with JWT and org_id (persisted to Postgres)."""
    raise HTTPException(
        status_code=410,
        detail=(
            "Use POST /api/v1/shasta/scans with Authorization Bearer token and body "
            '{"cloud":"aws","org_id":"..."}.'
        ),
    )
