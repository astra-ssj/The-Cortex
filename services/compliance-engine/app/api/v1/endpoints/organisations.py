# organisations — Organisation posture (bulletproof; no heavy imports).

from fastapi import APIRouter, Depends
from core.security import get_current_user
from datetime import datetime

router = APIRouter()

POSTURE_DATA = {
    "org_id": "demo-org-001",
    "org_name": "AstraLabs Group",
    "overall_score": 58,
    "audit_readiness": 53,
    "risk_level": "CRITICAL",
    "compliant_count": 0,
    "critical_gaps": 16,
    "last_assessed": "2026-02-24T00:00:00Z",
    "frameworks": [
        {
            "framework_id": "iso27001-2022",
            "framework_name": "ISO/IEC 27001:2022",
            "version": "v2022",
            "jurisdiction": "international",
            "score": 62,
            "status": "PARTIAL",
            "risk_level": "HIGH",
            "gap_count": 23,
            "control_count": 93,
            "trend": 2.1,
        },
        {
            "framework_id": "gdpr-2016-679",
            "framework_name": "GDPR 2016/679",
            "version": "v1.0",
            "jurisdiction": "EU",
            "score": 58,
            "status": "PARTIAL",
            "risk_level": "HIGH",
            "gap_count": 6,
            "control_count": 25,
            "trend": 0.0,
        },
        {
            "framework_id": "nis2-2022-2555",
            "framework_name": "NIS2 Directive",
            "version": "v1.0",
            "jurisdiction": "EU",
            "score": 44,
            "status": "NON_COMPLIANT",
            "risk_level": "CRITICAL",
            "gap_count": 8,
            "control_count": 20,
            "trend": -1.5,
        },
        {
            "framework_id": "nist-csf-2.0",
            "framework_name": "NIST CSF 2.0",
            "version": "v2.0",
            "jurisdiction": "US",
            "score": 67,
            "status": "PARTIAL",
            "risk_level": "MEDIUM",
            "gap_count": 26,
            "control_count": 106,
            "trend": 3.2,
        },
        {
            "framework_id": "csa-ccm-v4",
            "framework_name": "CSA CCM v4.0",
            "version": "v4.0",
            "jurisdiction": "international",
            "score": 61,
            "status": "PARTIAL",
            "risk_level": "HIGH",
            "gap_count": 49,
            "control_count": 197,
            "trend": 0.0,
        },
        {
            "framework_id": "cyber-essentials-v3.1",
            "framework_name": "Cyber Essentials v3.1",
            "version": "v3.1",
            "jurisdiction": "UK",
            "score": 78,
            "status": "PARTIAL",
            "risk_level": "MEDIUM",
            "gap_count": 4,
            "control_count": 18,
            "trend": 1.0,
        },
        {
            "framework_id": "eu-ai-act-2024",
            "framework_name": "EU AI Act 2024",
            "version": "v2024",
            "jurisdiction": "EU",
            "score": 41,
            "status": "NON_COMPLIANT",
            "risk_level": "CRITICAL",
            "gap_count": 8,
            "control_count": 31,
            "trend": 0.0,
        },
        {
            "framework_id": "eu-cybersecurity-act",
            "framework_name": "EU Cybersecurity Act",
            "version": "v1.0",
            "jurisdiction": "EU",
            "score": 55,
            "status": "PARTIAL",
            "risk_level": "HIGH",
            "gap_count": 5,
            "control_count": 22,
            "trend": 0.5,
        },
    ],
}


@router.get("/{org_id}/posture")
async def get_posture(
    org_id: str,
    current_user=Depends(get_current_user),
):
    data = POSTURE_DATA.copy()
    data["org_id"] = org_id
    data["last_assessed"] = datetime.utcnow().isoformat() + "Z"
    return data


@router.get("")
async def list_organisations(current_user=Depends(get_current_user)):
    return [
        {
            "id": "demo-org-001",
            "name": "AstraLabs Group",
            "jurisdiction": "international",
            "entities": 6,
        }
    ]
