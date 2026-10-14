# compliance/mappings.py — Cross-framework control mapping engine.
# Cross-mappings between ISO 27001:2022, NIS2, DORA, GDPR, EU AI Act, and ISO 42001:2023.
# Enables "Assess Once, Comply Many" across regulatory frameworks.

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


class ControlMapping(BaseModel):
    """Directional mapping between controls across frameworks."""

    source_framework: str = Field(..., description="Source framework ID, e.g. iso27001-2022")
    source_control: str = Field(..., description="Source control ID, e.g. A.8.4")
    target_framework: str = Field(..., description="Target framework ID, e.g. dora-2022-2554")
    target_control: str = Field(..., description="Target control ID, e.g. DORA-Art.9")
    relationship: str = Field(default="EQUIVALENT", description="EQUIVALENT | OVERLAPS | PARTIAL")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    basis: str = Field(default="", description="Regulatory rationale for mapping")


# Authoritative cross-framework mapping catalog
_AUTHORITATIVE_MAPPINGS: list[ControlMapping] = [
    # ── ISO 27001 ↔ NIS2 ──────────────────────────────────────────────────────────
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.5.15",
        target_framework="nis2-2022-2555",
        target_control="NIS2-RM-09",
        relationship="EQUIVALENT",
        confidence=0.92,
        basis="Access control management policies align with NIS2 access controls",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.8.4",
        target_framework="nis2-2022-2555",
        target_control="NIS2-RM-10",
        relationship="EQUIVALENT",
        confidence=0.95,
        basis="Both enforce multi-factor authentication (MFA) for privileged and remote access",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.8.8",
        target_framework="nis2-2022-2555",
        target_control="NIS2-RM-05",
        relationship="EQUIVALENT",
        confidence=0.90,
        basis="Technical vulnerability management and vulnerability scanning requirements",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.8.13",
        target_framework="nis2-2022-2555",
        target_control="NIS2-RM-03",
        relationship="EQUIVALENT",
        confidence=0.92,
        basis="Information backup and recovery operations",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.5.19",
        target_framework="nis2-2022-2555",
        target_control="NIS2-RM-04",
        relationship="OVERLAPS",
        confidence=0.88,
        basis="Information security in supplier relationships and supply chain security",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.5.26",
        target_framework="nis2-2022-2555",
        target_control="NIS2-RM-02",
        relationship="EQUIVALENT",
        confidence=0.92,
        basis="Incident management response planning and execution",
    ),

    # ── ISO 27001 ↔ DORA ──────────────────────────────────────────────────────────
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.8.2",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.9",
        relationship="EQUIVALENT",
        confidence=0.94,
        basis="Privileged access rights align with DORA Art. 9 identity management and access control policy",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.8.4",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.9",
        relationship="EQUIVALENT",
        confidence=0.95,
        basis="MFA and strong authentication required by DORA Art. 9(4)(c) Protection and Prevention",
    ),

    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.8.8",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.24",
        relationship="EQUIVALENT",
        confidence=0.90,
        basis="Vulnerability assessments and gap analyses under DORA general testing programme",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.8.13",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.12",
        relationship="EQUIVALENT",
        confidence=0.95,
        basis="Backup policy, segregated storage, and recovery procedures under DORA Art. 12",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.5.19",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.28",
        relationship="OVERLAPS",
        confidence=0.85,
        basis="Supplier security management aligns with DORA ICT third-party risk strategy",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.5.26",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.17",
        relationship="EQUIVALENT",
        confidence=0.92,
        basis="Incident response planning satisfies DORA ICT incident management process",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.5.30",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.11",
        relationship="EQUIVALENT",
        confidence=0.90,
        basis="ICT readiness for business continuity satisfies DORA Art. 11 response and recovery",
    ),

    # ── NIS2 ↔ DORA ──────────────────────────────────────────────────────────────
    ControlMapping(
        source_framework="nis2-2022-2555",
        source_control="NIS2-RM-10",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.9",
        relationship="EQUIVALENT",
        confidence=0.98,
        basis="Both require multi-factor authentication, secure communication, and identity controls",
    ),
    ControlMapping(
        source_framework="nis2-2022-2555",
        source_control="NIS2-RM-02",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.17",
        relationship="EQUIVALENT",
        confidence=0.95,
        basis="Incident handling and reporting requirements",
    ),
    ControlMapping(
        source_framework="nis2-2022-2555",
        source_control="NIS2-RM-03",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.11",
        relationship="EQUIVALENT",
        confidence=0.94,
        basis="Business continuity and disaster recovery plans",
    ),
    ControlMapping(
        source_framework="nis2-2022-2555",
        source_control="NIS2-RM-04",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.28",
        relationship="EQUIVALENT",
        confidence=0.92,
        basis="Supply chain and ICT third-party service provider risk assessment",
    ),
    ControlMapping(
        source_framework="nis2-2022-2555",
        source_control="NIS2-RM-06",
        target_framework="dora-2022-2554",
        target_control="DORA-Art.26",
        relationship="OVERLAPS",
        confidence=0.88,
        basis="Cybersecurity testing aligns with threat-led penetration testing (TLPT)",
    ),

    # ── ISO 27001 ↔ GDPR ──────────────────────────────────────────────────────────
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="a.8.4",
        target_framework="gdpr-2016-679",
        target_control="security-of-processing",
        relationship="OVERLAPS",
        confidence=0.85,
        basis="Technical access control and authentication measures satisfy GDPR Art. 32 security of processing",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.8.4",
        target_framework="gdpr-2016-679",
        target_control="security-of-processing",
        relationship="OVERLAPS",
        confidence=0.85,
        basis="Technical access control and authentication measures satisfy GDPR Art. 32 security of processing",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="a.5.26",
        target_framework="gdpr-2016-679",
        target_control="breach-notification",
        relationship="OVERLAPS",
        confidence=0.88,
        basis="Incident response procedures support GDPR Art. 33/34 personal data breach notification requirements",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="A.5.26",
        target_framework="gdpr-2016-679",
        target_control="breach-notification",
        relationship="OVERLAPS",
        confidence=0.88,
        basis="Incident response procedures support GDPR Art. 33/34 personal data breach notification requirements",
    ),
    ControlMapping(
        source_framework="iso27001-2022",
        source_control="a.5.19",
        target_framework="gdpr-2016-679",
        target_control="accountability-3",
        relationship="OVERLAPS",
        confidence=0.82,
        basis="Supplier security management supports GDPR Art. 28 processor obligations",
    ),

    # ── EU AI Act ↔ ISO/IEC 42001:2023 ──────────────────────────────────────────
    ControlMapping(
        source_framework="eu-ai-act-2024",
        source_control="AI-RM-1",
        target_framework="iso42001-2023",
        target_control="ISO42001-A.4.2",
        relationship="EQUIVALENT",
        confidence=0.95,
        basis="AI risk management system (Art. 9) matches ISO 42001 AI risk & resource governance",
    ),
    ControlMapping(
        source_framework="eu-ai-act-2024",
        source_control="AI-HO-1",
        target_framework="iso42001-2023",
        target_control="ISO42001-A.6.2",
        relationship="EQUIVALENT",
        confidence=0.96,
        basis="Human oversight requirements (Art. 14) correspond to ISO 42001 life-cycle controls",
    ),
    ControlMapping(
        source_framework="eu-ai-act-2024",
        source_control="AI-DG-1",
        target_framework="iso42001-2023",
        target_control="ISO42001-A.7.3",
        relationship="EQUIVALENT",
        confidence=0.95,
        basis="Training and validation data governance (Art. 10) maps to ISO 42001 data quality controls",
    ),
    ControlMapping(
        source_framework="eu-ai-act-2024",
        source_control="AI-TR-1",
        target_framework="iso42001-2023",
        target_control="ISO42001-A.8.2",
        relationship="EQUIVALENT",
        confidence=0.94,
        basis="Transparency and provision of information to deployers (Art. 13) maps to user notices",
    ),
    ControlMapping(
        source_framework="eu-ai-act-2024",
        source_control="AI-RM-5",
        target_framework="iso42001-2023",
        target_control="ISO42001-A.8.4",
        relationship="EQUIVALENT",
        confidence=0.92,
        basis="Serious incident reporting (Art. 73) corresponds to AI incident communication",
    ),
]


def get_cross_framework_mappings(
    source_framework: Optional[str] = None,
    target_framework: Optional[str] = None,
) -> List[ControlMapping]:
    """
    Retrieve bidirectional cross-framework control mappings.
    If source_framework or target_framework is specified, filters results.
    """
    results: list[ControlMapping] = []
    for m in _AUTHORITATIVE_MAPPINGS:
        # Check forward match
        forward_match = (
            (source_framework is None or m.source_framework == source_framework)
            and (target_framework is None or m.target_framework == target_framework)
        )
        if forward_match:
            results.append(m)
            continue

        # Check reciprocal match
        reciprocal_match = (
            (source_framework is None or m.target_framework == source_framework)
            and (target_framework is None or m.source_framework == target_framework)
        )
        if reciprocal_match:
            results.append(
                ControlMapping(
                    source_framework=m.target_framework,
                    source_control=m.target_control,
                    target_framework=m.source_framework,
                    target_control=m.source_control,
                    relationship=m.relationship,
                    confidence=m.confidence,
                    basis=m.basis,
                )
            )

    return results
