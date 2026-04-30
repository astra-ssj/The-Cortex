# api/organisations.py — Organisation endpoints (posture scoped by JWT + optional demo org).

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.schemas import CompliancePosture, FrameworkPosture, OrgProfile
from compliance import FrameworkId, exists
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, resolve_scoped_org_id
from services.posture_calculator import PostureCalculator, _risk

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["organisations"])

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

DEMO_ORG = {
    "id": "demo-org-001",
    "name": "AstraLabs Group",
    "jurisdiction": "EU",
    "industry": "Technology",
    "region": "EU",
    "frameworks": [f.value for f in DEMO_POSTURE_FRAMEWORKS],
}

DEMO_CRITICAL_GAPS: list[dict] = []


async def _fetch_org(session: AsyncSession, org_id: str) -> dict | None:
    try:
        res = await session.execute(
            text(
                """
                SELECT id::text AS id, name::text AS name, jurisdiction::text AS jurisdiction,
                       industry::text AS industry, region::text AS region,
                       selected_frameworks, COALESCE(is_demo, FALSE) AS is_demo
                FROM organizations WHERE id = :id
                """
            ),
            {"id": org_id},
        )
        row = res.mappings().one_or_none()
        return dict(row) if row else None
    except ProgrammingError:
        await session.rollback()
        return None


async def _assessment_result_count(session: AsyncSession, org_id: str) -> int:
    try:
        res = await session.execute(
            text("SELECT COUNT(*) FROM assessment_results WHERE org_id = :oid"),
            {"oid": org_id},
        )
        return int(res.scalar_one() or 0)
    except ProgrammingError:
        await session.rollback()
        return 0


def _framework_ids_for_org(org_row: dict | None, effective_id: str) -> list[FrameworkId]:
    if effective_id == DEMO_ORG_ID:
        return list(DEMO_POSTURE_FRAMEWORKS)
    raw = (org_row or {}).get("selected_frameworks")
    if isinstance(raw, list) and raw:
        out: list[FrameworkId] = []
        for x in raw:
            try:
                out.append(FrameworkId(str(x)))
            except ValueError:
                continue
        return [fid for fid in out if exists(fid.value)]
    return list(DEMO_POSTURE_FRAMEWORKS)


@router.get("/organisations/{org_id}", response_model=OrgProfile)
async def get_organisation(
    org_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> OrgProfile:
    effective = resolve_scoped_org_id(current_user, org_id)
    row = await _fetch_org(session, effective)
    if row:
        return OrgProfile(
            id=row["id"],
            name=row["name"],
            jurisdiction=row.get("jurisdiction") or "",
            industry=row.get("industry"),
            region=row.get("region"),
        )
    if effective == DEMO_ORG_ID:
        return OrgProfile(
            id=DEMO_ORG["id"],
            name=DEMO_ORG["name"],
            jurisdiction=DEMO_ORG["jurisdiction"],
            industry=DEMO_ORG["industry"],
            region=DEMO_ORG["region"],
        )
    raise HTTPException(status_code=404, detail=f"Organisation not found: {effective}")


@router.get("/organisations/{org_id}/posture", response_model=CompliancePosture)
async def get_organisation_posture(
    org_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> CompliancePosture:
    effective = resolve_scoped_org_id(current_user, org_id)
    row = await _fetch_org(session, effective)

    org_name = DEMO_ORG["name"]
    industry = DEMO_ORG["industry"]
    if row:
        org_name = row["name"]
        industry = row.get("industry") or "technology"
    elif effective != DEMO_ORG_ID:
        raise HTTPException(status_code=404, detail=f"Organisation not found: {effective}")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    n_results = await _assessment_result_count(session, effective)

    if effective != DEMO_ORG_ID and n_results == 0:
        return CompliancePosture(
            organisation_id=effective,
            organisation_name=org_name,
            frameworks=[],
            updated_at=now,
            overall_score=0,
            audit_readiness=0,
            risk_level="NOT_ASSESSED",
            critical_gaps=[],
            last_assessed=now,
            message="Run your first assessment to see results",
        )

    org_ctx = {
        "maturity_score": 0.42,
        "industry": str(industry).lower(),
        "employee_count": 500,
        "existing_controls": [
            "mfa_enforced",
            "encryption_at_rest",
            "vulnerability_scanning",
            "security_training",
            "incident_response_plan",
        ],
    }

    framework_ids = _framework_ids_for_org(row, effective)
    framework_ids = [fid for fid in framework_ids if exists(fid.value)]
    calculator = PostureCalculator()
    framework_postures: list[FrameworkPosture] = []
    for fid in framework_ids:
        raw = calculator.calculate_framework_posture(fid, org_ctx)
        trend = await calculator.get_trend(session, effective, fid)
        raw["trend"] = trend
        framework_postures.append(
            FrameworkPosture(
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
            )
        )

    scores = [fp.score for fp in framework_postures if fp.score is not None]
    overall = round(sum(scores) / len(scores)) if scores else 0

    return CompliancePosture(
        organisation_id=effective,
        organisation_name=org_name,
        frameworks=framework_postures,
        updated_at=now,
        overall_score=overall,
        audit_readiness=round(overall * 0.92),
        risk_level=_risk(float(overall)),
        critical_gaps=DEMO_CRITICAL_GAPS,
        last_assessed=now,
    )
