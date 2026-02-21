# api/organisations.py — Organisation endpoints (posture, etc.).

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, HTTPException

from compliance import FrameworkId, get

from api.schemas import CompliancePosture, ControlPosture, FrameworkPosture, OrgProfile

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["organisations"])

# Mock org profile for demo-org-001 (seeded in init.sql). Replace with DB lookup when ready.
DEMO_ORG = {
    "id": "demo-org-001",
    "name": "Acme EU Services Ltd",
    "jurisdiction": "EU",
    "industry": "Technology",
    "region": "EU",
}

# Mock posture status per control for demo. In production, derive from assessment results.
def _mock_control_postures(framework_id: str) -> list[ControlPosture]:
    fw = get(FrameworkId(framework_id))
    if fw is None:
        return []
    # Deterministic mock: cycle compliant, partial, non_compliant, not_assessed by index.
    statuses = ("compliant", "partial", "non_compliant", "not_assessed")
    controls: list[ControlPosture] = []
    for i, c in enumerate(fw.controls):
        status = statuses[i % len(statuses)]
        controls.append(ControlPosture(
            control_id=c.id,
            control_name=c.name,
            status=status,
            last_assessed_at="2025-02-15T10:00:00Z" if status != "not_assessed" else None,
            finding_summary="Mock finding." if status == "partial" else None,
        ))
    return controls


def _mock_posture(org_id: str, org_name: str) -> CompliancePosture:
    """Build mock CompliancePosture for demo-org-001 from all registered frameworks."""
    frameworks: list[FrameworkPosture] = []
    for fid in FrameworkId:
        fw = get(fid)
        if fw is None:
            continue
        controls = _mock_control_postures(fid.value)
        frameworks.append(FrameworkPosture(
            framework_id=fw.id,
            framework_name=fw.name,
            control_count=len(fw.controls),
            controls=controls,
        ))
    return CompliancePosture(
        organisation_id=org_id,
        organisation_name=org_name,
        frameworks=frameworks,
        updated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


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
async def get_organisation_posture(org_id: str) -> CompliancePosture:
    """Return compliance posture for an organisation. Mock data for demo-org-001 (init.sql)."""
    if org_id == "demo-org-001":
        logger.info("posture_request", org_id=org_id, mock=True)
        return _mock_posture(DEMO_ORG["id"], DEMO_ORG["name"])
    raise HTTPException(status_code=404, detail=f"Organisation not found: {org_id}")
