# api/compliance.py — Organisational compliance posture derived from training.
#
# One read endpoint. Everything it returns is derived per request from completed
# scenario_sessions, so there is no rollup table that can drift away from the
# decisions that produced it. If the derivation ever becomes too slow to compute
# inline, a materialised rollup is the follow-up — not a cache bolted on here.

from __future__ import annotations

from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from compliance import FrameworkId
from compliance.models import SovereignModel
from core.control_posture import (
    STATUS_GAP,
    coverable_controls,
    derive_control_posture,
    load_choice_catalogue,
    load_completed_sessions,
    not_assessed_controls,
)
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, bind_scoped_org, resolve_scoped_org_id

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/compliance", tags=["compliance"])


class ControlOut(BaseModel):
    """One control the org has demonstrated competency against."""

    ref: str
    name: str
    competency: int
    status: str = Field(description="strong | developing | gap")
    dimensions: list[str] = Field(default_factory=list)
    scenario_slug: Optional[str] = Field(
        default=None, description="Scenario that exercises this control, for the practise link"
    )


class UnassessedControlOut(BaseModel):
    ref: str
    name: str


class OverviewSummary(BaseModel):
    controls_assessed: int
    controls_available: int = Field(description="Controls the active scenarios can exercise")
    average_competency: int
    open_gaps: int


class ComplianceOverviewOut(SovereignModel):
    """Org-scoped posture for one framework — inherits ZTAIP sovereignty tags."""

    org_id: str
    org_label: str
    framework: str
    framework_name: str
    summary: OverviewSummary
    controls: list[ControlOut] = Field(default_factory=list)
    not_assessed: list[UnassessedControlOut] = Field(default_factory=list)


_ORG_LABEL_SQL = text("SELECT name FROM organizations WHERE id = :org_id")


def _resolve_org(current_user: dict[str, Any], requested: Optional[str]) -> str:
    if requested and requested.strip():
        return resolve_scoped_org_id(current_user, requested.strip())
    return str(current_user.get("org_id") or DEMO_ORG_ID).strip()


@router.get(
    "/overview",
    response_model=ComplianceOverviewOut,
    summary="Org compliance posture derived from completed training",
)
async def get_compliance_overview(
    framework: str = Query(
        FrameworkId.ISO27001_2022.value, description="Framework id, e.g. iso27001-2022"
    ),
    org_id: Optional[str] = Query(None, description="Scoped organisation id"),
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ComplianceOverviewOut:
    try:
        framework_id = FrameworkId(framework)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown framework: {framework}",
        )

    from compliance import get as get_framework

    registered = get_framework(framework_id)
    if registered is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Framework not registered: {framework}",
        )

    effective = await bind_scoped_org(db, current_user, _resolve_org(current_user, org_id))

    catalogue = await load_choice_catalogue(db)
    sessions = await load_completed_sessions(db, effective)

    controls = derive_control_posture(sessions, catalogue, framework_id)
    coverable = coverable_controls(catalogue)
    assessed = {row.ref for row in controls}

    # Controls this framework does not define are not the org's problem to close.
    known = {control.id for control in registered.controls}
    coverable &= known

    average = round(sum(row.competency for row in controls) / len(controls)) if controls else 0

    label_row = (await db.execute(_ORG_LABEL_SQL, {"org_id": effective})).first()
    org_label = str(label_row[0]) if label_row and label_row[0] else effective

    logger.info(
        "compliance_overview_derived",
        org_id=effective,
        framework_id=framework_id.value,
        sessions=len(sessions),
        controls_assessed=len(controls),
        controls_available=len(coverable),
    )

    return ComplianceOverviewOut(
        jurisdiction="internal",
        purpose_tags=["compliance", "assessment", "learning"],
        org_id=effective,
        org_label=org_label,
        framework=framework_id.value,
        framework_name=registered.name,
        summary=OverviewSummary(
            controls_assessed=len(controls),
            controls_available=len(coverable),
            average_competency=average,
            open_gaps=sum(1 for row in controls if row.status == STATUS_GAP),
        ),
        controls=[
            ControlOut(
                ref=row.ref,
                name=row.name,
                competency=row.competency,
                status=row.status,
                dimensions=row.dimensions,
                scenario_slug=row.scenario_slug,
            )
            for row in controls
        ],
        not_assessed=[
            UnassessedControlOut(**row)
            for row in not_assessed_controls(assessed, coverable, framework_id)
        ],
    )
