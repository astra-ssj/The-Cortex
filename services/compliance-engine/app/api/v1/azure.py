# azure.py — POST /api/v1/connectors/azure/connect and /sync. Validate credentials, discovery, SSE for sync.

from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.audit_fabric import audit_fabric
from app.connectors.azure import AzureConnector
from app.connectors.azure.azure_connector import store_connector_credentials
from app.connectors.azure.azure_evidence import create_evidence_from_control_findings

logger = structlog.get_logger()

router = APIRouter(prefix="/connectors/azure", tags=["azure-connector"])


class AzureConnectBody(BaseModel):
    tenant_id: str = Field(..., description="Azure tenant ID")
    client_id: str = Field(..., description="Service principal client ID")
    client_secret: str = Field(..., description="Service principal secret")
    subscription_id: str = Field(..., description="Azure subscription ID")


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/connect")
async def azure_connect(body: AzureConnectBody) -> dict:
    """
    Validate credentials, run discovery, store credentials (encrypted) for sync.
    Return: systems_found, controls_assessed, findings_created.
    """
    audit_fabric.log(
        "azure_connect_start",
        entity_type="connector",
        entity_id="azure",
        payload={"tenant_id": body.tenant_id[:8] + "..."},
    )
    connector = AzureConnector(
        tenant_id=body.tenant_id,
        client_id=body.client_id,
        client_secret=body.client_secret,
        subscription_id=body.subscription_id,
    )
    try:
        await connector.connect()
    except Exception as e:
        audit_fabric.log(
            "azure_connect_error",
            entity_type="connector",
            entity_id="azure",
            payload={"error": str(e)},
        )
        raise HTTPException(status_code=400, detail=f"Azure connection failed: {e}") from e
    store_connector_credentials(
        body.tenant_id,
        body.client_id,
        body.client_secret,
        body.subscription_id,
    )
    systems = await connector.discover_systems()
    controls = await connector.discover_controls()
    findings = await connector.pull_findings()
    evidence_list = create_evidence_from_control_findings(controls, defender_score=0.85)
    audit_fabric.log(
        "azure_connect_done",
        entity_type="connector",
        entity_id="azure",
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
    from app.connectors.azure.azure_connector import create_connector_from_store

    audit_fabric.log("azure_sync_start", entity_type="connector", entity_id="azure")
    connector = create_connector_from_store()
    if not connector:
        yield _sse("error", {"message": "No stored credentials. Call POST /connect first."})
        audit_fabric.log("azure_sync_error", entity_type="connector", entity_id="azure", payload={"error": "no_credentials"})
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
        evidence_list = create_evidence_from_control_findings(controls, defender_score=0.85)
        yield _sse("evidence", {"count": len(evidence_list)})
        yield _sse("summary", {"systems_found": len(systems), "controls_assessed": len(controls), "findings_created": len(findings), "evidence_created": len(evidence_list)})
        yield _sse("done", {})
        audit_fabric.log(
            "azure_sync_done",
            entity_type="connector",
            entity_id="azure",
            payload={"systems_found": len(systems), "evidence_created": len(evidence_list)},
        )
    except Exception as e:
        logger.exception("azure_sync_error", error=str(e))
        audit_fabric.log("azure_sync_error", entity_type="connector", entity_id="azure", payload={"error": str(e)})
        yield _sse("error", {"message": str(e)})


@router.post("/sync")
async def azure_sync() -> StreamingResponse:
    """Re-run discovery with stored credentials; stream progress via SSE (same pattern as assessments)."""
    return StreamingResponse(
        _run_sync_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
