# app/api/v1/endpoints/reports.py — Audit report generator (DB-backed executive summary + PDF export).

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from core.audit_fabric import audit_fabric
from core.executive_summary_report import build_executive_summary
from core.report_pdf import executive_summary_pdf_filename, render_executive_summary_pdf
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, bind_scoped_org, resolve_scoped_org_id

logger = structlog.get_logger()

router = APIRouter(tags=["reports"])


async def _fetch_json(
    base_url: str,
    path: str,
    auth_header: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """GET path from same origin; return JSON or None on failure."""
    import httpx

    url = f"{base_url.rstrip('/')}{path}"
    headers = {"Accept": "application/json"}
    if auth_header:
        headers["Authorization"] = auth_header
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, headers=headers)
            if r.status_code == 200:
                res = r.json()
                return res if isinstance(res, dict) else None
    except Exception as e:
        logger.warning("report_fetch_failed", path=path, error=str(e))
    return None


def _resolve_report_params(
    current_user: dict[str, Any],
    org_id: Optional[str],
    as_at: Optional[str],
    entity_scope: Optional[str],
) -> tuple[str, str, str]:
    raw_org = org_id or current_user.get("org_id") or DEMO_ORG_ID
    scoped_org = resolve_scoped_org_id(current_user, str(raw_org))
    as_at_date = (as_at or datetime.now(timezone.utc).strftime("%Y-%m-%d")).strip()
    esc_raw = (entity_scope or "").strip()
    scope_upper = esc_raw.upper() if esc_raw.upper() not in ("ALL", "") else ""
    return scoped_org, as_at_date, scope_upper


@router.get("/executive-summary", summary="Get executive summary report data")
async def get_executive_summary(
    request: Request,
    org_id: Optional[str] = None,
    as_at: Optional[str] = None,
    entity_scope: Optional[str] = None,
    current_user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    scoped_org, as_at_date, scope_upper = _resolve_report_params(
        current_user, org_id, as_at, entity_scope
    )
    await bind_scoped_org(session, current_user, scoped_org)
    base = str(request.base_url).rstrip("/")
    auth = request.headers.get("Authorization")
    ztaip = await _fetch_json(base, "/api/v1/system/ztaip-status", auth)
    return await build_executive_summary(
        session,
        scoped_org=scoped_org,
        as_at_date=as_at_date,
        entity_scope_upper=scope_upper,
        ztaip=ztaip,
    )


@router.get("/executive-summary/export", summary="Download executive summary as PDF")
async def export_executive_summary_pdf(
    request: Request,
    org_id: Optional[str] = None,
    as_at: Optional[str] = None,
    entity_scope: Optional[str] = None,
    format: Literal["pdf"] = Query("pdf", description="Export format (pdf only)"),
    current_user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Response:
    """Server-generated PDF for auditor handoff (evidence IDs + findings)."""
    if format != "pdf":
        raise HTTPException(status_code=400, detail="Supported format: pdf")

    scoped_org, as_at_date, scope_upper = _resolve_report_params(
        current_user, org_id, as_at, entity_scope
    )
    await bind_scoped_org(session, current_user, scoped_org)
    base = str(request.base_url).rstrip("/")
    auth = request.headers.get("Authorization")
    ztaip = await _fetch_json(base, "/api/v1/system/ztaip-status", auth)

    audit_fabric.log(
        "report_export_start",
        entity_type="report",
        entity_id=f"executive-summary:{scoped_org}",
        payload={"org_id": scoped_org, "as_at": as_at_date, "format": format},
    )

    report = await build_executive_summary(
        session,
        scoped_org=scoped_org,
        as_at_date=as_at_date,
        entity_scope_upper=scope_upper,
        ztaip=ztaip,
    )
    pdf_bytes = render_executive_summary_pdf(report)
    filename = executive_summary_pdf_filename(report)

    audit_fabric.log(
        "report_export_done",
        entity_type="report",
        entity_id=f"executive-summary:{scoped_org}",
        payload={
            "org_id": scoped_org,
            "filename": filename,
            "bytes": len(pdf_bytes),
            "evidence_count": len(report.get("evidence_vault") or []),
        },
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )
