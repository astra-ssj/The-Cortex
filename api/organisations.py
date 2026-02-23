# api/organisations.py — Organisation endpoints (posture, etc.).

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, HTTPException

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["organisations"])

# Mock org profile for demo-org-001 (seeded in init.sql). Replace with DB lookup when ready.
DEMO_ORG = {
    "id": "demo-org-001",
    "name": "AstraLabs Group",
    "jurisdiction": "EU",
    "industry": "Technology",
    "region": "EU",
}


@router.get("/organisations/{org_id}")
async def get_organisation(org_id: str):
    """Return organisation profile. Mock for demo-org-001."""
    if org_id == "demo-org-001":
        return {
            "id": DEMO_ORG["id"],
            "name": DEMO_ORG["name"],
            "jurisdiction": DEMO_ORG["jurisdiction"],
            "industry": DEMO_ORG["industry"],
            "region": DEMO_ORG["region"],
        }
    raise HTTPException(status_code=404, detail=f"Organisation not found: {org_id}")


@router.get("/organisations/{org_id}/posture")
async def get_posture(org_id: str):
    """Bulletproof posture: always returns data for dashboard. No DB/calculator dependency."""
    return {
        "org_id": org_id,
        "org_name": "AstraLabs Group",
        "overall_score": 58,
        "audit_readiness": 53,
        "risk_level": "CRITICAL",
        "compliant_count": 0,
        "critical_gaps": 16,
        "last_assessed": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "frameworks": [
            {"framework_id": "iso27001-2022", "framework_name": "ISO/IEC 27001:2022", "version": "v2022", "jurisdiction": "international", "score": 62, "status": "PARTIAL", "risk_level": "HIGH", "gap_count": 23, "control_count": 93, "trend": 2.1},
            {"framework_id": "gdpr-2016-679", "framework_name": "GDPR 2016/679", "version": "v1.0", "jurisdiction": "EU", "score": 58, "status": "PARTIAL", "risk_level": "HIGH", "gap_count": 6, "control_count": 25, "trend": 0.0},
            {"framework_id": "nis2-2022-2555", "framework_name": "NIS2 Directive", "version": "v1.0", "jurisdiction": "EU", "score": 44, "status": "NON_COMPLIANT", "risk_level": "CRITICAL", "gap_count": 8, "control_count": 20, "trend": -1.5},
            {"framework_id": "nist-csf-2.0", "framework_name": "NIST CSF 2.0", "version": "v2.0", "jurisdiction": "US", "score": 67, "status": "PARTIAL", "risk_level": "MEDIUM", "gap_count": 26, "control_count": 106, "trend": 3.2},
            {"framework_id": "csa-ccm-v4", "framework_name": "CSA CCM v4.0", "version": "v4.0", "jurisdiction": "international", "score": 61, "status": "PARTIAL", "risk_level": "HIGH", "gap_count": 49, "control_count": 197, "trend": 0.0},
            {"framework_id": "cyber-essentials-v3.1", "framework_name": "Cyber Essentials v3.1", "version": "v3.1", "jurisdiction": "UK", "score": 78, "status": "PARTIAL", "risk_level": "MEDIUM", "gap_count": 4, "control_count": 18, "trend": 1.0},
            {"framework_id": "eu-ai-act-2024", "framework_name": "EU AI Act 2024", "version": "v2024", "jurisdiction": "EU", "score": 41, "status": "NON_COMPLIANT", "risk_level": "CRITICAL", "gap_count": 8, "control_count": 31, "trend": 0.0},
            {"framework_id": "eu-cybersecurity-act", "framework_name": "EU Cybersecurity Act", "version": "v1.0", "jurisdiction": "EU", "score": 55, "status": "PARTIAL", "risk_level": "HIGH", "gap_count": 5, "control_count": 22, "trend": 0.5},
        ],
    }


@router.get("/findings")
async def list_findings():
    """List findings (evidence). Stub: returns empty list until findings API is implemented."""
    return []


@router.get("/reports/executive-summary")
async def get_executive_summary():
    """Executive summary report. Stub: returns placeholder until report API is implemented."""
    return {"summary": "Executive summary report will be available when the report API is implemented.", "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
