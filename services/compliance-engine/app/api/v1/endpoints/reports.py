# reports.py — Audit report generator (board-ready executive summary).

from fastapi import APIRouter, Depends
from core.security import get_current_user
from datetime import datetime

router = APIRouter(tags=["reports"])


@router.get("/executive-summary")
async def get_executive_summary(
    current_user=Depends(get_current_user),
):
    return {
        "as_at": datetime.utcnow().strftime("%Y-%m-%d"),
        "org_id": "demo-org-001",
        "org_name": "AstraLabs Group",
        "classification": "Board Confidential",
        "prepared_by": "CORTEX Intelligence Platform",
        "overall_score": 58,
        "audit_readiness": 53,
        "risk_level": "CRITICAL",
        "frameworks_active": 8,
        "controls_assessed": 491,
        "critical_gaps": 16,
        "findings_open": 11,
        "findings_overdue": 0,
        "frameworks": [
            {"name": "ISO/IEC 27001:2022", "score": 62, "status": "PARTIAL", "risk": "HIGH", "gaps": 23},
            {"name": "GDPR 2016/679", "score": 58, "status": "PARTIAL", "risk": "HIGH", "gaps": 6},
            {"name": "NIS2 Directive", "score": 44, "status": "NON_COMPLIANT", "risk": "CRITICAL", "gaps": 8},
            {"name": "NIST CSF 2.0", "score": 67, "status": "PARTIAL", "risk": "MEDIUM", "gaps": 26},
            {"name": "CSA CCM v4.0", "score": 61, "status": "PARTIAL", "risk": "HIGH", "gaps": 49},
            {"name": "Cyber Essentials v3.1", "score": 78, "status": "PARTIAL", "risk": "MEDIUM", "gaps": 4},
            {"name": "EU AI Act 2024", "score": 41, "status": "NON_COMPLIANT", "risk": "CRITICAL", "gaps": 8},
            {"name": "EU Cybersecurity Act", "score": 55, "status": "PARTIAL", "risk": "HIGH", "gaps": 5},
        ],
        "top_findings": [
            {"title": "72-hour breach notification not tested", "framework": "GDPR", "owner": "CISO", "due": "2026-03-10", "days_open": 45},
            {"title": "NIS2 24-hour CSIRT process undefined", "framework": "NIS2", "owner": "Security Lead DE", "due": "2026-03-10", "days_open": 45},
            {"title": "Human oversight for AI decisions absent", "framework": "EU AI Act", "owner": "Unassigned", "due": "2026-03-10", "days_open": 45},
            {"title": "Supply chain assessment not performed", "framework": "NIS2", "owner": "CISO", "due": "2026-03-24", "days_open": 30},
            {"title": "Penetration test overdue — 18 months elapsed", "framework": "ISO 27001", "owner": "CTO", "due": "2026-03-17", "days_open": 25},
        ],
        "regulatory_exposure": [
            {"regulation": "NIS2 Directive", "status": "AT RISK", "deadline": "Already in force", "max_fine": "€10M or 2% turnover"},
            {"regulation": "GDPR", "status": "AT RISK", "deadline": "Already in force", "max_fine": "€20M or 4% turnover"},
            {"regulation": "EU AI Act", "status": "CRITICAL", "deadline": "Aug 2026", "max_fine": "€35M or 7% turnover"},
            {"regulation": "ISO 27001", "status": "IN PROGRESS", "deadline": "Certification TBD", "max_fine": "N/A"},
        ],
        "recommendations": [
            "Implement NIS2 registration for DE and ES entities immediately — regulatory deadline passed",
            "Complete GDPR 72-hour breach notification procedure testing within 30 days",
            "Assign EU AI Act human oversight owner — currently unassigned with Aug 2026 deadline",
            "Commission penetration test — last performed 18 months ago, overdue by 6 months",
            "Complete supply chain security assessments for Tier 1 vendors",
            "Appoint DPO for UK entity to satisfy post-Brexit UK GDPR requirements",
            "Accelerate ISO 27001 certification programme — currently at 62% readiness",
        ],
        "management_attention": [
            "Two frameworks at CRITICAL risk (NIS2: 44%, EU AI Act: 41%) require board escalation",
            "Combined regulatory exposure exceeds €65M across active frameworks",
            "3 of 11 open findings are CRITICAL severity with no assigned owners",
        ],
    }
