# tests/test_report_pdf.py — Executive summary PDF export.

from __future__ import annotations


from core.report_pdf import executive_summary_pdf_filename, render_executive_summary_pdf


def test_render_executive_summary_pdf_produces_valid_pdf() -> None:
    report = {
        "org_name": "AstraLabs Group",
        "org_id": "demo-org-001",
        "as_at": "2026-05-21",
        "entity_scope": "ALL",
        "overall_posture": {
            "group_compliance_score": 62,
            "audit_readiness": 57,
            "overall_risk_level": "HIGH",
            "frameworks_active": 4,
            "critical_gaps": 2,
            "findings_open": 5,
            "findings_overdue": 3,
        },
        "framework_summary": [
            {
                "framework_name": "GDPR 2016/679",
                "score": 58,
                "status": "PARTIAL",
                "risk_level": "HIGH",
            }
        ],
        "top_critical_findings": [
            {
                "id": "finding-001",
                "title": "Breach notification not tested",
                "framework": "GDPR",
                "control_id": "GDPR-BN-02",
                "severity": "CRITICAL",
                "status": "OPEN",
                "owner": "CISO",
                "due_date": "2026-03-15",
                "days_open": 45,
            }
        ],
        "evidence_vault": [
            {
                "id": "e0000001-0000-0000-0000-000000000001",
                "title": "MFA coverage report",
                "evidence_type": "SCAN",
                "status": "VALID",
                "controls_linked": "ISO-A.5.17 (iso27001-2022)",
            }
        ],
        "regulatory_exposure": [
            {
                "regulation": "GDPR",
                "status": "AT RISK",
                "likely_fine": "€1,000,000",
                "basis": "Art.83",
            }
        ],
        "management_attention": ["1 CRITICAL finding"],
        "recommendations": ["Test breach procedure"],
        "next_review": "2026-06-21",
    }
    pdf = render_executive_summary_pdf(report)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 2000
    assert executive_summary_pdf_filename(report).endswith(".pdf")
