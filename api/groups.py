# api/groups.py — Multi-entity group posture (mirrors compliance-engine endpoint when engine not loaded).

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, resolve_scoped_org_id

router = APIRouter(prefix="/api/v1", tags=["groups"])


def _demo_group_posture() -> dict:
    """Return group-level compliance posture across all 6 AstraLabs entities."""
    return {
        "group_name": "AstraLabs Group",
        "as_at": datetime.utcnow().isoformat() + "Z",
        "overall_score": 58,
        "overall_risk": "CRITICAL",
        "entities_count": 6,
        "frameworks_active": 8,
        "critical_findings": 3,
        "entities": [
            {
                "id": "de-001",
                "name": "AstraLabs DE",
                "jurisdiction": "DE",
                "flag": "🇩🇪",
                "type": "ESSENTIAL",
                "employees": 280,
                "role": "Group HQ + Shared Services",
                "overall_score": 54,
                "risk_level": "CRITICAL",
                "status": "NON_COMPLIANT",
                "frameworks": [
                    {"id": "iso27001-2022", "name": "ISO 27001", "score": 62, "status": "PARTIAL", "risk": "HIGH"},
                    {"id": "gdpr-2016-679", "name": "GDPR", "score": 58, "status": "PARTIAL", "risk": "HIGH"},
                    {"id": "nis2-2022-2555", "name": "NIS2", "score": 44, "status": "NON_COMPLIANT", "risk": "CRITICAL"},
                    {"id": "eu-ai-act-2024", "name": "EU AI Act", "score": 41, "status": "NON_COMPLIANT", "risk": "CRITICAL"},
                ],
                "critical_findings": 3,
                "open_findings": 6,
                "last_assessed": "2026-02-23",
            },
            {
                "id": "uk-001",
                "name": "AstraLabs UK",
                "jurisdiction": "UK",
                "flag": "🇬🇧",
                "type": "IMPORTANT",
                "employees": 95,
                "role": "Integration in progress",
                "overall_score": 48,
                "risk_level": "CRITICAL",
                "status": "NON_COMPLIANT",
                "frameworks": [
                    {"id": "iso27001-2022", "name": "ISO 27001", "score": 55, "status": "PARTIAL", "risk": "HIGH"},
                    {"id": "gdpr-2016-679", "name": "UK GDPR", "score": 49, "status": "NON_COMPLIANT", "risk": "CRITICAL"},
                    {"id": "cyber-essentials-v3.1", "name": "Cyber Essentials", "score": 78, "status": "PARTIAL", "risk": "MEDIUM"},
                ],
                "critical_findings": 2,
                "open_findings": 4,
                "last_assessed": "2026-02-23",
            },
            {
                "id": "au-001",
                "name": "AstraLabs AU",
                "jurisdiction": "AU",
                "flag": "🇦🇺",
                "type": "STANDARD",
                "employees": 45,
                "role": "APAC Operations",
                "overall_score": 61,
                "risk_level": "HIGH",
                "status": "PARTIAL",
                "frameworks": [
                    {"id": "iso27001-2022", "name": "ISO 27001", "score": 61, "status": "PARTIAL", "risk": "HIGH"},
                    {"id": "nist-csf-2.0", "name": "NIST CSF", "score": 67, "status": "PARTIAL", "risk": "MEDIUM"},
                ],
                "critical_findings": 0,
                "open_findings": 2,
                "last_assessed": "2026-02-23",
            },
            {
                "id": "th-001",
                "name": "AstraLabs TH",
                "jurisdiction": "TH",
                "flag": "🇹🇭",
                "type": "STANDARD",
                "employees": 30,
                "role": "APAC Development Hub",
                "overall_score": 65,
                "risk_level": "MEDIUM",
                "status": "PARTIAL",
                "frameworks": [
                    {"id": "iso27001-2022", "name": "ISO 27001", "score": 65, "status": "PARTIAL", "risk": "MEDIUM"},
                    {"id": "nist-csf-2.0", "name": "NIST CSF", "score": 70, "status": "PARTIAL", "risk": "MEDIUM"},
                ],
                "critical_findings": 0,
                "open_findings": 1,
                "last_assessed": "2026-02-23",
            },
            {
                "id": "es-001",
                "name": "AstraLabs ES",
                "jurisdiction": "ES",
                "flag": "🇪🇸",
                "type": "ESSENTIAL",
                "employees": 55,
                "role": "EU Operations + NIS2 Scope",
                "overall_score": 42,
                "risk_level": "CRITICAL",
                "status": "NON_COMPLIANT",
                "frameworks": [
                    {"id": "iso27001-2022", "name": "ISO 27001", "score": 58, "status": "PARTIAL", "risk": "HIGH"},
                    {"id": "gdpr-2016-679", "name": "GDPR", "score": 55, "status": "PARTIAL", "risk": "HIGH"},
                    {"id": "nis2-2022-2555", "name": "NIS2", "score": 38, "status": "NON_COMPLIANT", "risk": "CRITICAL"},
                ],
                "critical_findings": 1,
                "open_findings": 3,
                "last_assessed": "2026-02-23",
            },
            {
                "id": "us-001",
                "name": "AstraLabs US",
                "jurisdiction": "US",
                "flag": "🇺🇸",
                "type": "STANDARD",
                "employees": 25,
                "role": "Americas Sales + Support",
                "overall_score": 70,
                "risk_level": "MEDIUM",
                "status": "PARTIAL",
                "frameworks": [
                    {"id": "nist-csf-2.0", "name": "NIST CSF", "score": 70, "status": "PARTIAL", "risk": "MEDIUM"},
                    {"id": "csa-ccm-v4", "name": "CSA CCM", "score": 68, "status": "PARTIAL", "risk": "MEDIUM"},
                ],
                "critical_findings": 0,
                "open_findings": 1,
                "last_assessed": "2026-02-23",
            },
        ],
    }


@router.get("/groups/posture")
async def get_group_posture(
    org_id: Optional[str] = Query(None, description="Scoped organisation id (demo toggle)"),
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    scope = (org_id or current_user.get("org_id") or DEMO_ORG_ID).strip()
    effective = resolve_scoped_org_id(current_user, scope)
    if effective == DEMO_ORG_ID:
        return _demo_group_posture()

    display_name = effective
    try:
        res = await session.execute(
            text("SELECT name::text FROM organizations WHERE id = :id"),
            {"id": effective},
        )
        n = res.scalar_one_or_none()
        if n:
            display_name = str(n)
    except ProgrammingError:
        await session.rollback()

    now = datetime.utcnow().isoformat() + "Z"
    return {
        "group_name": display_name,
        "as_at": now,
        "overall_score": 0,
        "overall_risk": "NOT_ASSESSED",
        "entities_count": 1,
        "frameworks_active": 0,
        "critical_findings": 0,
        "entities": [
            {
                "id": effective,
                "name": display_name,
                "jurisdiction": "",
                "flag": "",
                "type": "STANDARD",
                "employees": 0,
                "role": "Primary entity",
                "overall_score": 0,
                "risk_level": "NOT_ASSESSED",
                "status": "NOT_ASSESSED",
                "frameworks": [],
                "critical_findings": 0,
                "open_findings": 0,
                "last_assessed": "",
            },
        ],
    }
