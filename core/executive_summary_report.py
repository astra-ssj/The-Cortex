# core/executive_summary_report.py — DB-backed executive summary payload for API and PDF export.

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import structlog
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


def regulatory_exposure(fw_results: list[Any]) -> list[dict[str, Any]]:
    """Estimate regulatory fine exposure from framework posture rows."""
    exposure: list[dict[str, Any]] = []
    for r in fw_results:
        fid = str(r.get("framework_id") or "")
        score = float(r.get("score") or 0)
        if fid == "nis2-2022-2555" and score < 70:
            likely = round(10_000_000 * (1 - score / 100) * 0.24)
            exposure.append({
                "regulation": "NIS2 Directive",
                "max_fine": "€10M or 2% turnover",
                "likely_fine": f"€{likely:,.0f}",
                "basis": "Art.34(4)",
                "status": "AT RISK",
            })
        if fid == "gdpr-2016-679" and score < 70:
            likely = round(20_000_000 * (1 - score / 100) * 0.16)
            exposure.append({
                "regulation": "GDPR 2016/679",
                "max_fine": "€20M or 4% turnover",
                "likely_fine": f"€{likely:,.0f}",
                "basis": "Art.83(4)",
                "status": "AT RISK",
            })
        if fid == "eu-ai-act-2024" and score < 70:
            likely = round(35_000_000 * (1 - score / 100) * 0.24)
            exposure.append({
                "regulation": "EU AI Act 2024",
                "max_fine": "€35M or 7% turnover",
                "likely_fine": f"€{likely:,.0f}",
                "basis": "Art.99(3)",
                "status": "CRITICAL",
            })
    return exposure


async def fetch_evidence_for_report(
    session: AsyncSession,
    org_id: str,
    *,
    limit: int = 15,
) -> list[dict[str, Any]]:
    """Evidence vault rows with linked controls for auditor pack."""
    try:
        rows = (
            await session.execute(
                text(
                    """
                    SELECT e.id::text AS id, e.title::text AS title,
                           e.evidence_type::text AS evidence_type, e.source::text AS source,
                           e.status::text AS status,
                           e.collected_at::text AS collected_at,
                           COALESCE(
                             (
                               SELECT string_agg(
                                 ec.control_id || ' (' || ec.framework_id || ')',
                                 ', ' ORDER BY ec.control_id
                               )
                               FROM evidence_controls ec
                               WHERE ec.evidence_id = e.id
                             ),
                             ''
                           ) AS controls_linked
                    FROM evidence e
                    WHERE e.org_id = :oid
                    ORDER BY e.collected_at DESC NULLS LAST
                    LIMIT :lim
                    """
                ),
                {"oid": org_id, "lim": limit},
            )
        ).mappings().all()
        return [dict(r) for r in rows]
    except ProgrammingError:
        await session.rollback()
        return []


async def build_executive_summary(
    session: AsyncSession,
    *,
    scoped_org: str,
    as_at_date: str,
    entity_scope_upper: str = "",
    ztaip: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Assemble executive summary JSON (same contract as GET /reports/executive-summary)."""
    scope_upper = entity_scope_upper.strip().upper()
    org_name = "AstraLabs Group"
    overall = 0
    readiness = 0
    risk = "UNKNOWN"
    fw_results: list[Any] = []
    findings_rows: list[Any] = []

    try:
        org_row = await session.execute(
            text(
                """
                SELECT name::text AS name, overall_score, audit_readiness,
                       risk_level::text AS risk_level, updated_at
                FROM organizations WHERE id = :oid
                """
            ),
            {"oid": scoped_org},
        )
        org = org_row.mappings().one_or_none()
        if org:
            org_d = dict(org)
            org_name = str(org_d.get("name") or org_name)
            if org_d.get("overall_score") is not None:
                overall = int(org_d["overall_score"])
            if org_d.get("audit_readiness") is not None:
                readiness = int(org_d["audit_readiness"])
            rl = org_d.get("risk_level")
            if isinstance(rl, str) and rl.strip():
                risk = rl.strip().upper()

        fw_res = await session.execute(
            text(
                """
                SELECT ar.framework_id::text AS framework_id, ar.score,
                       ar.gap_count, ar.status::text AS status,
                       ar.risk_level::text AS risk_level, ar.trend,
                       f.name::text AS framework_name
                FROM assessment_results ar
                LEFT JOIN frameworks f ON f.id = ar.framework_id
                WHERE ar.org_id = :oid
                ORDER BY ar.score ASC NULLS LAST
                """
            ),
            {"oid": scoped_org},
        )
        fw_results = list(fw_res.mappings().all())

        find_res = await session.execute(
            text(
                """
                SELECT fi.id::text AS id, fi.title::text AS title, fi.framework_id::text AS framework_id,
                       fi.control_id::text AS control_id, fi.severity::text AS severity,
                       fi.status::text AS status, fi.owner::text AS owner, fi.due_date,
                       fi.days_open, fi.confidence,
                       fw.name::text AS framework_name,
                       fi.entity_code::text AS entity_code
                FROM findings fi
                LEFT JOIN frameworks fw ON fw.id = fi.framework_id
                WHERE fi.org_id = :oid
                  AND (
                    :no_entity_scope
                    OR UPPER(TRIM(COALESCE(fi.entity_code, ''))) = UPPER(TRIM(:entity_scope_val))
                  )
                ORDER BY
                  CASE fi.severity
                    WHEN 'CRITICAL' THEN 1
                    WHEN 'HIGH' THEN 2
                    WHEN 'MEDIUM' THEN 3
                    ELSE 4
                  END,
                  fi.days_open DESC NULLS LAST
                LIMIT 10
                """
            ),
            {
                "oid": scoped_org,
                "no_entity_scope": scope_upper == "",
                "entity_scope_val": scope_upper,
            },
        )
        findings_rows = list(find_res.mappings().all())
    except ProgrammingError as e:
        await session.rollback()
        logger.warning("executive_summary_db_partial", error=str(e))

    if fw_results and overall == 0:
        scores = [float(r["score"]) for r in fw_results if r.get("score") is not None]
        if scores:
            overall = round(sum(scores) / len(scores))
    if fw_results and readiness == 0 and overall:
        readiness = round(overall * 0.92)
    if fw_results and risk == "UNKNOWN":
        scores = [float(r["score"]) for r in fw_results if r.get("score") is not None]
        if scores:
            avg = sum(scores) / len(scores)
            from services.posture_calculator import _risk

            risk = _risk(float(round(avg)))

    critical_gaps = sum(1 for r in fw_results if str(r.get("risk_level") or "").upper() == "CRITICAL")
    compliant_count = sum(1 for r in fw_results if str(r.get("status") or "").upper() == "COMPLIANT")
    total_gaps = sum(int(r["gap_count"] or 0) for r in fw_results)
    exposure = regulatory_exposure(fw_results)

    open_status = {"OPEN", "IN_PROGRESS"}
    findings_open_ct = sum(
        1 for f in findings_rows if str(f.get("status") or "").upper() == "OPEN"
    )
    overdue_ct = sum(
        1
        for f in findings_rows
        if f.get("days_open") is not None and int(f["days_open"] or 0) > 30
    )

    framework_summary = [
        {
            "framework_name": str(r.get("framework_name") or r.get("framework_id") or ""),
            "score": int(round(float(r["score"]))) if r.get("score") is not None else None,
            "status": str(r.get("status") or "NOT_ASSESSED"),
            "risk_level": str(r.get("risk_level") or "UNKNOWN"),
        }
        for r in fw_results
    ]

    frameworks_full = [
        {
            "framework_id": str(r.get("framework_id") or ""),
            "framework_name": str(r.get("framework_name") or r.get("framework_id") or ""),
            "score": int(round(float(r["score"]))) if r.get("score") is not None else None,
            "status": str(r.get("status") or "NOT_ASSESSED"),
            "risk_level": str(r.get("risk_level") or "UNKNOWN"),
            "gap_count": int(r["gap_count"] or 0) if r.get("gap_count") is not None else 0,
            "trend": float(r["trend"]) if r.get("trend") is not None else 0.0,
        }
        for r in fw_results
    ]

    top_findings: list[dict[str, Any]] = []
    for f in findings_rows:
        dd = f.get("due_date")
        due_s = str(dd) if dd is not None else ""
        fw_label = str(f.get("framework_name") or f.get("framework_id") or "")
        top_findings.append({
            "id": str(f.get("id") or ""),
            "title": str(f.get("title") or ""),
            "framework": fw_label,
            "framework_id": str(f.get("framework_id") or ""),
            "control_id": str(f.get("control_id") or ""),
            "severity": str(f.get("severity") or ""),
            "status": str(f.get("status") or ""),
            "owner": str(f.get("owner") or "Unassigned"),
            "due_date": due_s,
            "days_open": int(f.get("days_open") or 0),
            "confidence": float(f.get("confidence") or 1.0),
        })

    next_review = (
        datetime.strptime(as_at_date, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=30)
    ).strftime("%Y-%m-%d")

    critical_open = sum(
        1 for f in findings_rows
        if str(f.get("severity") or "").upper() == "CRITICAL"
        and str(f.get("status") or "").upper() in open_status
    )

    evidence_vault = await fetch_evidence_for_report(session, scoped_org)

    return {
        "as_at": as_at_date,
        "org_id": scoped_org,
        "org_name": org_name,
        "entity_scope": scope_upper or "ALL",
        "overall_posture": {
            "group_compliance_score": overall,
            "overall_score": overall,
            "audit_readiness": readiness,
            "overall_risk_level": risk,
            "frameworks_active": len(fw_results),
            "total_controls_assessed": 491,
            "critical_gaps": critical_gaps,
            "compliant_count": compliant_count,
            "total_gaps": total_gaps,
            "findings_open": findings_open_ct,
            "findings_overdue": overdue_ct,
        },
        "framework_summary": framework_summary,
        "frameworks": frameworks_full,
        "top_critical_findings": top_findings,
        "evidence_vault": evidence_vault,
        "regulatory_exposure": exposure,
        "management_attention": [
            f"{critical_open} CRITICAL findings require immediate action",
            "NIS2 registration deadline approaching (ES entity)",
            f"{overdue_ct} findings overdue — escalation required",
            f"Next assessment scheduled: {as_at_date}",
        ],
        "recommendations": [
            "Register DE and ES entities under NIS2 immediately",
            "Complete GDPR 72-hour breach notification procedure testing",
            "Assign EU AI Act human oversight owner — Aug 2026 deadline",
            "Commission penetration test — 18 months overdue",
            "Accelerate ISO 27001 certification",
        ],
        "next_review": next_review,
        "ztaip": ztaip,
    }
