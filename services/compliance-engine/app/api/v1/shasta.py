# shasta.py — Legacy contract URL under compliance-engine v1; scans moved to api/shasta_cloud.py.

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from core.audit_fabric import audit_fabric

router = APIRouter(prefix="/connectors/shasta", tags=["shasta-connector"])

_DEPRECATED_SCAN = (
    "Use POST /api/v1/shasta/scans with Authorization and JSON body "
    '{"cloud":"aws"|"azure","org_id":"<org>"}. Applies migration 009_shasta_cloud.sql if missing.'
)


@router.get("/contract")
async def shasta_contract() -> dict:
    """Machine-readable subprocess/programmatic contract (SQLite is never SoT)."""
    audit_fabric.log("shasta_contract_view", entity_type="connector", entity_id="shasta")
    from app.connectors.shasta.shasta_adapter import shasta_contract_payload

    return shasta_contract_payload("any")


@router.post("/scan")
async def shasta_scan_removed() -> dict:
    """Removed: unauthenticated scan. See POST /api/v1/shasta/scans."""
    raise HTTPException(status_code=410, detail=_DEPRECATED_SCAN)
