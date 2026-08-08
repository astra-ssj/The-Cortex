# Legacy Shasta connector routes — prefer /api/v1/shasta/* (api/shasta_cloud.py).

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.connectors.shasta.shasta_adapter import shasta_contract_payload

router = APIRouter(prefix="/connectors/shasta", tags=["shasta-connector"])


@router.get("/contract")
async def shasta_contract_legacy() -> dict:
    """Deprecated alias of GET /api/v1/shasta/contract."""
    return shasta_contract_payload()


@router.post("/scan")
async def shasta_scan_legacy() -> JSONResponse:
    """Removed — use POST /api/v1/shasta/scans."""
    return JSONResponse(
        status_code=410,
        content={
            "detail": "Use POST /api/v1/shasta/scans (org-scoped, Postgres-backed). See GET /api/v1/shasta/contract.",
        },
    )
