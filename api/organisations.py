# api/organisations.py — Organisation endpoints (posture scoped by JWT + optional demo org).

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.schemas import CompliancePosture, FrameworkPosture, OrgProfile
from compliance import FrameworkId
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, resolve_scoped_org_id

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


async def _fetch_org(session: AsyncSession, org_id: str) -> dict[str, Any] | None:
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


async def _fetch_org_posture_row(session: AsyncSession, org_id: str) -> dict[str, Any] | None:
    """Organisation summary columns used by posture (extended schema from migration 005)."""
    try:
        res = await session.execute(
            text(
                """
                SELECT id::text AS id, name::text AS name, updated_at,
                       overall_score, audit_readiness, risk_level::text AS risk_level
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


async def _fetch_assessment_posture_rows(session: AsyncSession, org_id: str) -> list[Any]:
    try:
        res = await session.execute(
            text(
                """
                SELECT ar.framework_id::text AS framework_id,
                       ar.score,
                       ar.gap_count,
                       ar.status::text AS status,
                       ar.risk_level::text AS risk_level,
                       ar.trend,
                       ar.assessed_at,
                       f.name::text AS framework_name,
                       f.version::text AS version,
                       f.jurisdiction::text AS jurisdiction,
                       COALESCE(f.control_count, 0) AS control_count
                FROM assessment_results ar
                LEFT JOIN frameworks f ON f.id = ar.framework_id
                WHERE ar.org_id = :oid
                ORDER BY ar.score ASC NULLS LAST
                """
            ),
            {"oid": org_id},
        )
        return list(res.mappings().all())
    except ProgrammingError:
        await session.rollback()
        return []


def _num(row_val: Any) -> float:
    if row_val is None:
        return 0.0
    return float(row_val)


def _int_score(row_val: Any) -> int | None:
    if row_val is None:
        return None
    return int(round(float(row_val)))


@router.get("/organisations/{org_id}", response_model=OrgProfile)
async def get_organisation(
    org_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
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
    current_user: dict[str, Any] = Depends(get_current_user),
) -> CompliancePosture:
    effective = resolve_scoped_org_id(current_user, org_id)
    row = await _fetch_org(session, effective)
    org_posture = await _fetch_org_posture_row(session, effective)

    org_name = DEMO_ORG["name"]
    if row:
        org_name = row["name"]
    elif effective != DEMO_ORG_ID:
        raise HTTPException(status_code=404, detail=f"Organisation not found: {effective}")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    results = await _fetch_assessment_posture_rows(session, effective)

    if not results:
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

    overall_score = 0
    audit_readiness = 0
    risk_level = "UNKNOWN"
    last_ts: datetime | None = None
    if org_posture:
        if org_posture.get("overall_score") is not None:
            overall_score = int(org_posture["overall_score"])
        if org_posture.get("audit_readiness") is not None:
            audit_readiness = int(org_posture["audit_readiness"])
        rl = org_posture.get("risk_level")
        if isinstance(rl, str) and rl.strip():
            risk_level = rl.strip().upper()
        ua = org_posture.get("updated_at")
        if isinstance(ua, datetime):
            last_ts = ua

    framework_postures: list[FrameworkPosture] = []
    for r in results:
        assessed = r.get("assessed_at")
        assessed_s: str | None = None
        if isinstance(assessed, datetime):
            assessed_s = assessed.isoformat()
            if last_ts is None or assessed > last_ts:
                last_ts = assessed
        elif assessed is not None:
            assessed_s = str(assessed)
        fw_name = r.get("framework_name") or r.get("framework_id") or ""
        framework_postures.append(
            FrameworkPosture(
                framework_id=str(r.get("framework_id") or ""),
                framework_name=str(fw_name),
                control_count=int(r.get("control_count") or 0),
                controls=[],
                score=_int_score(r.get("score")),
                status=str(r.get("status") or "NOT_ASSESSED"),
                risk_level=str(r.get("risk_level") or "UNKNOWN"),
                gap_count=int(r.get("gap_count") or 0) if r.get("gap_count") is not None else None,
                trend=_num(r.get("trend")),
                jurisdiction=str(r.get("jurisdiction") or "") if r.get("jurisdiction") else None,
                last_assessed=assessed_s,
            )
        )

    if org_posture is None or org_posture.get("overall_score") is None:
        scores = [fp.score for fp in framework_postures if fp.score is not None]
        overall_score = round(sum(scores) / len(scores)) if scores else 0
    if org_posture is None or org_posture.get("audit_readiness") is None:
        audit_readiness = round(overall_score * 0.92) if overall_score else 0
    if risk_level == "UNKNOWN" and overall_score:
        from services.posture_calculator import _risk

        risk_level = _risk(float(overall_score))

    last_assessed_s = now
    if last_ts is not None and hasattr(last_ts, "isoformat"):
        last_assessed_s = last_ts.isoformat() if isinstance(last_ts, datetime) else str(last_ts)
    elif org_posture and org_posture.get("updated_at"):
        ua = org_posture["updated_at"]
        if hasattr(ua, "isoformat"):
            last_assessed_s = ua.isoformat() if isinstance(ua, datetime) else str(ua)

    return CompliancePosture(
        organisation_id=effective,
        organisation_name=org_name,
        frameworks=framework_postures,
        updated_at=now,
        overall_score=overall_score,
        audit_readiness=audit_readiness,
        risk_level=risk_level,
        critical_gaps=[],
        last_assessed=last_assessed_s,
    )
