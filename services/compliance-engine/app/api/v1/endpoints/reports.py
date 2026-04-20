# app/api/v1/endpoints/reports.py — Audit report generator.
# GET /api/v1/reports/executive-summary: aggregate posture, findings, ZTAIP into board-ready report.

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional, cast

import structlog
from fastapi import APIRouter, Depends, Request

from core.security import get_current_user

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
                return cast(dict[str, Any], res) if isinstance(res, dict) else None
    except Exception as e:
        logger.warning("report_fetch_failed", path=path, error=str(e))
    return None


@router.get("/executive-summary", summary="Get executive summary report data")
async def get_executive_summary(
    request: Request,
    org_id: str = "demo-org-001",
    as_at: Optional[str] = None,
    entity_scope: Optional[str] = None,
    _user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Pull posture, findings, and ZTAIP status; return structured report object
    for the Audit Report UI. Entity scope filters findings (e.g. DE, UK, All).
    """
    base = str(request.base_url).rstrip("/")
    auth = request.headers.get("Authorization")

    posture = await _fetch_json(base, f"/api/v1/organisations/{org_id}/posture", auth)
    findings_raw = await _fetch_json(base, "/api/v1/findings", auth)
    ztaip = await _fetch_json(base, "/api/v1/system/ztaip-status", auth)

    findings: list[dict[str, Any]] = list(findings_raw) if isinstance(findings_raw, list) else []
    if entity_scope and entity_scope.strip().upper() not in ("ALL", ""):
        findings = [f for f in findings if f.get("entity_code") == entity_scope.strip().upper()]

    open_findings = [f for f in findings if f.get("status") in ("OPEN", "IN_PROGRESS")]
    critical_findings = sorted(
        [f for f in open_findings if f.get("severity") == "CRITICAL"],
        key=lambda x: (x.get("due_date") or ""),
    )[:5]
    as_at_str = as_at if as_at else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    overdue_count = sum(
        [1 for f in open_findings if dict.get(f, "due_date") and str(dict.get(f, "due_date")) < as_at_str]
    )

    as_at_date = as_at or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    frameworks_active = 8
    total_controls = 491

    overall_score = 0
    audit_readiness = 0
    risk_level = "MEDIUM"
    framework_summary: list[dict[str, Any]] = []
    critical_gaps_count = 0

    if posture:
        overall_score = posture.get("overallScore") or posture.get("overall_score") or 0
        audit_readiness = posture.get("auditReadiness") or posture.get("audit_readiness") or round(overall_score * 0.92)
        risk_level = (posture.get("riskLevel") or posture.get("risk_level") or "MEDIUM").upper()
        critical_gaps = posture.get("criticalGaps") or posture.get("critical_gaps") or []
        critical_gaps_count = len(critical_gaps) if isinstance(critical_gaps, list) else 0
        fws = posture.get("frameworks") or []
        for fp in fws:
            framework_summary.append({
                "framework_name": fp.get("frameworkName") or fp.get("framework_name") or "",
                "score": fp.get("score"),
                "status": fp.get("status") or "not_assessed",
                "risk_level": fp.get("riskLevel") or fp.get("risk_level") or "MEDIUM",
            })

    if not framework_summary:
        framework_summary = [
            {"framework_name": "ISO/IEC 27001:2022", "score": 72, "status": "partial", "risk_level": "MEDIUM"},
            {"framework_name": "GDPR 2016/679", "score": 65, "status": "partial", "risk_level": "HIGH"},
            {"framework_name": "NIS2 Directive", "score": 58, "status": "non_compliant", "risk_level": "HIGH"},
            {"framework_name": "NIST CSF 2.0", "score": 70, "status": "partial", "risk_level": "MEDIUM"},
            {"framework_name": "CSA CCM v4.0", "score": 68, "status": "partial", "risk_level": "MEDIUM"},
            {"framework_name": "Cyber Essentials v3.1", "score": 75, "status": "partial", "risk_level": "LOW"},
            {"framework_name": "EU AI Act 2024", "score": 45, "status": "non_compliant", "risk_level": "HIGH"},
            {"framework_name": "EU Cybersecurity Act", "score": 62, "status": "partial", "risk_level": "MEDIUM"},
        ]

    # Compute overall_score, audit_readiness, critical_gaps from framework list when not from posture
    scores = [f["score"] for f in framework_summary if f.get("score") is not None]
    if scores:
        overall_score = round(sum(scores) / len(scores))
        audit_readiness = round(overall_score * 0.92)
    critical_gaps_count = sum(
        1 for f in framework_summary
        if f.get("risk_level") == "CRITICAL" or f.get("risk") == "CRITICAL"
    )

    next_review = (datetime.strptime(as_at_date, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")

    return {
        "as_at": as_at_date,
        "org_id": org_id,
        "org_name": (posture or {}).get("organisationName") or (posture or {}).get("organisation_name") or "AstraLabs Group",
        "overall_posture": {
            "group_compliance_score": overall_score,
            "audit_readiness": audit_readiness,
            "overall_risk_level": risk_level,
            "frameworks_active": frameworks_active,
            "total_controls_assessed": total_controls,
            "critical_gaps": critical_gaps_count,
            "findings_open": len(open_findings),
            "findings_overdue": overdue_count,
        },
        "framework_summary": framework_summary,
        "top_critical_findings": [
            {
                "title": f.get("title"),
                "framework": f.get("framework"),
                "owner": f.get("owner"),
                "due_date": f.get("due_date"),
                "days_open": f.get("days_open", 0),
            }
            for f in critical_findings
        ],
        "regulatory_exposure": {
            "nis2_art23_breach_reporting": "NOT READY",
            "gdpr_art33_72h_notification": "NOT READY",
            "eu_ai_act_art14_human_oversight": "PARTIAL",
            "iso27001_certification": "IN SCOPE",
        },
        "management_attention": [
            f"{len([x for x in open_findings if x.get('severity') == 'CRITICAL'])} CRITICAL findings require immediate action",
            "NIS2 registration deadline approaching (ES entity)",
            f"{overdue_count} findings overdue — escalation required",
            f"Next assessment scheduled: {as_at_date}",
        ],
        "recommendations": [
            "Prioritise NIS2 incident reporting process (NIS2-IR-01) — regulatory deadline risk",
            "Complete US SCC review (GDPR-IT-01) — DPO owned, due 2026-02-28",
            "Appoint UK DPO (GDPR-DPO-01) — UK entity exposure without DPO",
        ],
        "next_review": next_review,
        "ztaip": ztaip,
    }
