# api/microsoft_cloud.py — Microsoft 365 integration sync (mock Graph signals → Postgres + compliance graph).

from __future__ import annotations

from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.schemas import PaginatedJsonRows
from core.microsoft_cloud import get_m365_connection_status, run_and_persist_m365_sync
from core.rbac import Permission, require_permission
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, resolve_scoped_org_id

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/integrations/microsoft-365", tags=["microsoft-365"])


def _actor_label(user: dict[str, Any]) -> str:
    return str(user.get("email") or user.get("user_id") or "unknown")[:500]


class M365SyncRequest(BaseModel):
    org_id: str = Field(..., description="Organisation scope")


@router.get("/status", summary="Microsoft 365 connection and last sync status")
async def m365_status(
    org_id: Optional[str] = Query(None),
    current_user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    scoped = resolve_scoped_org_id(
        current_user, str(org_id or current_user.get("org_id") or DEMO_ORG_ID)
    )
    return await get_m365_connection_status(session, scoped)


@router.post("/sync", summary="Sync Microsoft 365 configuration signals")
async def m365_sync(
    body: M365SyncRequest,
    current_user: dict[str, Any] = Depends(require_permission(Permission.manage_integrations)),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Pull Entra ID / M365 signals into CORTEX. Uses mock adapter when ``CORTEX_M365_MOCK`` is enabled
    (default in local demo). Persists findings and creates compliance-graph evidence (source=microsoft).
    """
    scoped = resolve_scoped_org_id(current_user, body.org_id.strip())
    actor = _actor_label(current_user)

    try:
        from core.connectors.microsoft.mock_adapter import run_microsoft365_sync
    except ImportError as e:
        raise HTTPException(
            status_code=501,
            detail="Microsoft connector not available (core.connectors.microsoft missing).",
        ) from e

    try:
        engine_sync_id, normalized, mock_mode = await run_microsoft365_sync(scoped)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    result = await run_and_persist_m365_sync(
        session,
        org_id=scoped,
        created_by=actor,
        engine_sync_id=engine_sync_id,
        normalized=normalized,
        mock_mode=mock_mode,
    )
    return {
        "org_id": scoped,
        "engine_sync_id": engine_sync_id,
        **result,
    }


@router.get("/findings", summary="List Microsoft 365 findings for organisation")
async def m365_findings(
    org_id: Optional[str] = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> PaginatedJsonRows:
    scoped = resolve_scoped_org_id(
        current_user, str(org_id or current_user.get("org_id") or DEMO_ORG_ID)
    )
    try:
        total_row = await session.execute(
            text(
                """
                SELECT COUNT(*)::int AS c FROM microsoft_cloud_findings WHERE org_id = :org_id
                """
            ),
            {"org_id": scoped},
        )
        total = int(total_row.scalar() or 0)
        rows = (
            await session.execute(
                text(
                    """
                    SELECT id, sync_run_id::text AS sync_run_id, finding_key, external_id,
                           check_id, title, description, severity_normalized, compliance_status,
                           resource_type, resource_id, framework_controls, remediation,
                           collected_at, created_at
                    FROM microsoft_cloud_findings
                    WHERE org_id = :org_id
                    ORDER BY created_at DESC
                    OFFSET :offset LIMIT :limit
                    """
                ),
                {"org_id": scoped, "offset": offset, "limit": limit},
            )
        ).mappings().all()
        items = [dict(r) for r in rows]
        return PaginatedJsonRows(items=items, total=total, offset=offset, limit=limit)
    except Exception as e:
        await session.rollback()
        logger.warning("m365_findings_list_failed", error=str(e))
        return PaginatedJsonRows(items=[], total=0, offset=offset, limit=limit)
