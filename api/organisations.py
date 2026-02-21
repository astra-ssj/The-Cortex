# api/organisations.py — Organisation endpoints (posture, etc.).

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from compliance import FrameworkId, exists, get

from api.deps import get_db
from api.schemas import CompliancePosture, FrameworkPosture, OrgProfile
from services.posture_calculator import PostureCalculator, _risk

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["organisations"])

# Exactly the 8 frameworks for demo posture. No soc2, hipaa, pci-dss, ccpa.
DEMO_POSTURE_FRAMEWORKS: list[FrameworkId] = [
    FrameworkId.ISO27001_2022,
    FrameworkId.GDPR_2016_679,
    FrameworkId.NIS2_2022_2555,
    FrameworkId.NIST_CSF_2_0,
    FrameworkId.CSA_CCM_V4,
    FrameworkId.CYBER_ESSENTIALS_V3_1,
    FrameworkId.EU_AI_ACT_2024,
    FrameworkId.EU_CYBERSECURITY_ACT,
]

# Mock org profile for demo-org-001 (seeded in init.sql). Replace with DB lookup when ready.
DEMO_ORG = {
    "id": "demo-org-001",
    "name": "AstraLabs Group",
    "jurisdiction": "EU",
    "industry": "Technology",
    "region": "EU",
    "frameworks": [f.value for f in DEMO_POSTURE_FRAMEWORKS],
}

# Demo critical gaps list (replace with real gaps from assessments when ready).
DEMO_CRITICAL_GAPS: list[dict] = []


@router.get("/organisations/{org_id}", response_model=OrgProfile)
async def get_organisation(org_id: str) -> OrgProfile:
    """Return organisation profile. Mock for demo-org-001."""
    if org_id == "demo-org-001":
        return OrgProfile(
            id=DEMO_ORG["id"],
            name=DEMO_ORG["name"],
            jurisdiction=DEMO_ORG["jurisdiction"],
            industry=DEMO_ORG["industry"],
            region=DEMO_ORG["region"],
        )
    raise HTTPException(status_code=404, detail=f"Organisation not found: {org_id}")


@router.get("/organisations/{org_id}/posture", response_model=CompliancePosture)
async def get_organisation_posture(
    org_id: str,
    session: AsyncSession = Depends(get_db),
) -> CompliancePosture:
    """Return compliance posture for an organisation. Real scores from PostureCalculator."""
    if org_id != "demo-org-001":
        raise HTTPException(status_code=404, detail=f"Organisation not found: {org_id}")

    org = DEMO_ORG
    calculator = PostureCalculator()
    org_context = {
        "maturity_score": 0.42,
        "industry": org.get("industry", "technology"),
        "employee_count": 500,
        "existing_controls": [
            "mfa_enforced",
            "encryption_at_rest",
            "vulnerability_scanning",
            "security_training",
            "incident_response_plan",
        ],
    }

    framework_ids = [fid for fid in org["frameworks"] if exists(fid)]
    framework_postures: list[FrameworkPosture] = []
    for fid in framework_ids:
        raw = calculator.calculate_framework_posture(fid, org_context)
        trend = await calculator.get_trend(session, org_id, fid)
        raw["trend"] = trend
        framework_postures.append(FrameworkPosture(
            framework_id=raw["framework_id"],
            framework_name=raw["framework_name"],
            control_count=raw["control_count"],
            controls=[],
            score=raw["score"],
            status=raw["status"],
            risk_level=raw["risk_level"],
            gap_count=raw["gap_count"],
            trend=raw["trend"],
            jurisdiction=raw["jurisdiction"],
            last_assessed=raw["last_assessed"],
        ))

    scores = [fp.score for fp in framework_postures if fp.score is not None]
    overall = round(sum(scores) / len(scores)) if scores else 0
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    return CompliancePosture(
        organisation_id=org_id,
        organisation_name=org["name"],
        frameworks=framework_postures,
        updated_at=now,
        overall_score=overall,
        audit_readiness=round(overall * 0.92),
        risk_level=_risk(overall),
        critical_gaps=DEMO_CRITICAL_GAPS,
        last_assessed=now,
    )
