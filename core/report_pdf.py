# core/report_pdf.py — Server-side PDF for executive summary (auditor handoff).

from __future__ import annotations

import re
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _safe_filename_part(value: str, max_len: int = 40) -> str:
    cleaned = re.sub(r"[^\w\-]+", "-", value.strip())
    return (cleaned[:max_len] or "org").strip("-")


def _short_id(evidence_id: str) -> str:
    s = str(evidence_id).replace("-", "")
    return s[:8] if len(s) >= 8 else s


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    escaped = (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return Paragraph(escaped or "—", style)


def render_executive_summary_pdf(
    report: dict[str, Any],
    *,
    generated_at: datetime | None = None,
) -> bytes:
    """Build A4 PDF bytes from executive summary report dict."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"CORTEX Executive Summary — {report.get('org_name', '')}",
        author="CORTEX Intelligence Platform",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=16,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#475569"),
        spaceAfter=4,
    )
    section_style = ParagraphStyle(
        "Section",
        parent=styles["Heading2"],
        fontSize=11,
        textColor=colors.HexColor("#1e40af"),
        spaceBefore=10,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#0f172a"),
    )
    small_style = ParagraphStyle(
        "Small",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#64748b"),
    )

    generated = generated_at or datetime.now(timezone.utc)
    gen_label = generated.strftime("%Y-%m-%d %H:%M UTC")
    org_name = str(report.get("org_name") or "Organisation")
    as_at = str(report.get("as_at") or "")
    entity_scope = str(report.get("entity_scope") or "ALL")
    posture = report.get("overall_posture") or {}

    story: list[Any] = []

    story.append(_p("CORTEX — Zero Trust AI Platform", subtitle_style))
    story.append(_p("Executive Summary (Auditor Pack)", title_style))
    story.append(_p(f"{org_name} · As at {as_at} · Entity scope: {entity_scope}", subtitle_style))
    story.append(
        _p(
            f"Generated {gen_label} · Classification: Board Confidential",
            small_style,
        )
    )
    story.append(Spacer(1, 6 * mm))

    story.append(_p("OVERALL POSTURE", section_style))
    posture_rows = [
        ["Group compliance score", f"{posture.get('group_compliance_score', '—')}%"],
        ["Audit readiness", f"{posture.get('audit_readiness', '—')}%"],
        ["Overall risk level", str(posture.get("overall_risk_level") or "—")],
        ["Frameworks active", str(posture.get("frameworks_active") or "—")],
        ["Critical gaps", str(posture.get("critical_gaps") or "—")],
        ["Findings open", str(posture.get("findings_open") or "—")],
        ["Findings overdue", str(posture.get("findings_overdue") or "—")],
    ]
    pt = Table(posture_rows, colWidths=[70 * mm, 90 * mm])
    pt.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(pt)

    story.append(_p("FRAMEWORK POSTURE", section_style))
    fw_header = ["Framework", "Score", "Status", "Risk"]
    fw_data = [fw_header]
    for fw in report.get("framework_summary") or []:
        score = fw.get("score")
        fw_data.append(
            [
                str(fw.get("framework_name") or "")[:42],
                f"{score}%" if score is not None else "—",
                str(fw.get("status") or ""),
                str(fw.get("risk_level") or ""),
            ]
        )
    if len(fw_data) == 1:
        fw_data.append(["—", "—", "—", "—"])
    ft = Table(fw_data, colWidths=[68 * mm, 22 * mm, 38 * mm, 32 * mm])
    ft.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(ft)

    story.append(_p("TOP CRITICAL FINDINGS", section_style))
    findings = report.get("top_critical_findings") or []
    if findings:
        for i, f in enumerate(findings, 1):
            fid = str(f.get("id") or "")
            cid = str(f.get("control_id") or "")
            story.append(
                _p(
                    f"{i}. [{f.get('severity', '')}] {f.get('title', '')} — "
                    f"{f.get('framework', '')} · Control {cid} · Owner: {f.get('owner', '')}",
                    body_style,
                )
            )
            story.append(
                _p(
                    f"   Status: {f.get('status', '')} · Due: {f.get('due_date', '')} · "
                    f"{f.get('days_open', 0)} days open"
                    + (f" · Finding ID: {fid}" if fid else ""),
                    small_style,
                )
            )
    else:
        story.append(_p("No findings in scope.", body_style))

    story.append(_p("EVIDENCE VAULT (linked controls)", section_style))
    evidence = report.get("evidence_vault") or []
    if evidence:
        ev_header = ["Evidence ID", "Title", "Type", "Status", "Controls linked"]
        ev_data = [ev_header]
        for ev in evidence:
            controls = str(ev.get("controls_linked") or "")
            if len(controls) > 120:
                controls = controls[:117] + "..."
            ev_data.append(
                [
                    _short_id(str(ev.get("id") or "")),
                    str(ev.get("title") or "")[:48],
                    str(ev.get("evidence_type") or ""),
                    str(ev.get("status") or ""),
                    controls or "—",
                ]
            )
        et = Table(ev_data, colWidths=[22 * mm, 52 * mm, 22 * mm, 18 * mm, 56 * mm])
        et.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dcfce7")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(et)
        story.append(
            _p(
                "Full evidence UUIDs are recorded in CORTEX audit fabric and compliance graph.",
                small_style,
            )
        )
    else:
        story.append(_p("No evidence records for this organisation.", body_style))

    story.append(_p("REGULATORY EXPOSURE", section_style))
    exposure = report.get("regulatory_exposure") or []
    if isinstance(exposure, list) and exposure:
        for row in exposure:
            story.append(
                _p(
                    f"· {row.get('regulation', '')} — {row.get('status', '')} — "
                    f"{row.get('likely_fine', '')} ({row.get('basis', '')})",
                    body_style,
                )
            )
    else:
        story.append(_p("No elevated regulatory exposure flagged.", body_style))

    story.append(_p("MANAGEMENT ATTENTION", section_style))
    for item in report.get("management_attention") or []:
        story.append(_p(f"· {item}", body_style))

    story.append(_p("RECOMMENDATIONS", section_style))
    for i, rec in enumerate(report.get("recommendations") or [], 1):
        story.append(_p(f"{i}. {rec}", body_style))

    story.append(Spacer(1, 8 * mm))
    story.append(
        _p(
            f"Prepared by CORTEX Intelligence Platform · Next review: {report.get('next_review', '')}",
            small_style,
        )
    )
    story.append(
        _p("Confidential — not for distribution outside authorised audit engagement.", small_style),
    )

    doc.build(story)
    return buf.getvalue()


def executive_summary_pdf_filename(report: dict[str, Any]) -> str:
    """Auditor-friendly download filename."""
    org = _safe_filename_part(str(report.get("org_name") or report.get("org_id") or "org"))
    as_at = str(report.get("as_at") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    return f"{org}-Executive-Summary-{as_at}.pdf"
