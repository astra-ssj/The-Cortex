# compliance/dora.py — DORA (Regulation (EU) 2022/2554 — Digital Operational Resilience Act).
# Mapped directly from content/skills/extracted/dora/dora/SKILL.md and references.
# Exactly 5 domains covering ICT Risk Management, Incident Reporting, Resilience Testing,
# Third-Party Risk, and Information Sharing.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement

_E = EvidenceType


def _c(cid: str, name: str, domain: str, desc: str, article: str, ev_name: str, ev_desc: str = "") -> Control:
    return Control(
        id=cid,
        name=name,
        domain=domain,
        requirements=[
            Requirement(
                id=f"{cid}-req",
                article_ref=article,
                description=desc,
                evidence_types=[_E(id=f"{cid}-ev", name=ev_name, description=ev_desc or desc)],
            )
        ],
    )


def get_dora() -> Framework:
    """Build and return DORA compliance framework (Regulation (EU) 2022/2554)."""
    controls: list[Control] = []

    # 1. ICT Risk Management (Art. 5–16)
    d1 = "ICT Risk Management"
    controls.extend([
        _c(
            "DORA-Art.5",
            "Governance and Organisation",
            d1,
            "Management body defines, approves, oversees, and is accountable for the ICT risk management framework.",
            "Art.5",
            "ICT Governance Charter & Board Oversight Minutes",
        ),
        _c(
            "DORA-Art.6",
            "ICT Risk Management Framework",
            d1,
            "Documented strategies, policies, and procedures to identify, protect, detect, and respond to ICT risks.",
            "Art.6",
            "ICT Risk Management Framework Policy",
        ),
        _c(
            "DORA-Art.7",
            "ICT Systems, Protocols and Tools",
            d1,
            "Use resilient, secure ICT systems with adequate processing capacity and cryptographic controls.",
            "Art.7",
            "System Architecture Specification & Capacity Reports",
        ),
        _c(
            "DORA-Art.8",
            "Identification of Functions and Assets",
            d1,
            "Identify all ICT assets, critical or important functions, and dependencies on third-party providers.",
            "Art.8",
            "Information Asset Register & Critical Function Inventory",
        ),
        _c(
            "DORA-Art.9",
            "Protection and Prevention",
            d1,
            "Maintain comprehensive ICT security policies, access controls, network segmentation, and patch management.",
            "Art.9",
            "Access Control Matrix & Vulnerability Patch Logs",
        ),
        _c(
            "DORA-Art.10",
            "Detection of Anomalous Activities",
            d1,
            "Continuous monitoring mechanisms and multi-layered anomaly detection to identify ICT incidents promptly.",
            "Art.10",
            "SOC Monitoring Logs & Detection Alert Rules",
        ),
        _c(
            "DORA-Art.11",
            "Response and Recovery",
            d1,
            "Dedicated ICT business continuity policy, disaster recovery plans, and defined RTO/RPO objectives.",
            "Art.11",
            "Business Continuity Plan & Disaster Recovery Runbooks",
        ),
        _c(
            "DORA-Art.12",
            "Backup Policies and Recovery Procedures",
            d1,
            "Physically and logically segregated backup copies, regular restore testing, and immutable backup controls.",
            "Art.12",
            "Backup Restoration Test Reports & Immutable Storage Proof",
        ),
        _c(
            "DORA-Art.13",
            "Learning and Evolving",
            d1,
            "Mandatory post-incident reviews, root cause analysis, and crisis management training for staff.",
            "Art.13",
            "Post-Incident Review Reports & Training Records",
        ),
        _c(
            "DORA-Art.14",
            "Crisis Communication Plans",
            d1,
            "Crisis communication plans enabling controlled disclosure of major ICT incidents to clients and the public.",
            "Art.14",
            "Crisis Communication Plan & Designated Spokesperson Policy",
        ),
    ])

    # 2. ICT-Related Incident Management (Art. 17–23)
    d2 = "ICT-Related Incident Management"
    controls.extend([
        _c(
            "DORA-Art.17",
            "ICT Incident Management Process",
            d2,
            "Standardized process to record, monitor, track, categorize, and classify all ICT-related incidents.",
            "Art.17",
            "Incident Management Standard Operating Procedure",
        ),
        _c(
            "DORA-Art.18",
            "Classification of Incidents and Cyber Threats",
            d2,
            "Classify incidents based on clients affected, duration, geographic spread, data loss, and economic impact.",
            "Art.18",
            "Incident Classification Matrix & RTS Criteria Checklist",
        ),
        _c(
            "DORA-Art.19",
            "Reporting of Major ICT-Related Incidents",
            d2,
            "Report major ICT incidents to competent authorities via initial notification (4h), intermediate (72h), and final report.",
            "Art.19",
            "Regulatory Incident Notification Log & Submission Records",
        ),
    ])

    # 3. Digital Operational Resilience Testing (Art. 24–27)
    d3 = "Digital Operational Resilience Testing"
    controls.extend([
        _c(
            "DORA-Art.24",
            "General Testing Programme",
            d3,
            "Annual operational resilience testing programme including vulnerability assessments, scans, and gap analyses.",
            "Art.24",
            "Resilience Testing Schedule & Annual Assessment Report",
        ),
        _c(
            "DORA-Art.25",
            "Testing of ICT Tools and Systems",
            d3,
            "Appropriate tests conducted on all ICT systems and applications supporting critical or important functions.",
            "Art.25",
            "System Testing Execution Records",
        ),
        _c(
            "DORA-Art.26",
            "Threat-Led Penetration Testing (TLPT)",
            d3,
            "Advanced threat-led penetration testing at least every 3 years for critical entities (TIBER-EU framework aligned).",
            "Art.26",
            "TLPT Attestation & Remediation Roadmap",
        ),
        _c(
            "DORA-Art.27",
            "Requirements for Testers",
            d3,
            "TLPT testers must possess highest suitability, certifications (CREST/GIAC), professional indemnity, and independence.",
            "Art.27",
            "Tester Accreditation Dossier & Independence Declaration",
        ),
    ])

    # 4. Managing ICT Third-Party Risk (Art. 28–44)
    d4 = "Managing ICT Third-Party Risk"
    controls.extend([
        _c(
            "DORA-Art.28",
            "Strategy on ICT Third-Party Risk",
            d4,
            "Maintain a comprehensive third-party risk strategy and maintain an updated Register of Information (CIR 2024/2956).",
            "Art.28",
            "Register of Information & Third-Party Risk Strategy",
        ),
        _c(
            "DORA-Art.29",
            "Pre-Contractual Due Diligence and Concentration Risk",
            d4,
            "Assess suitability of ICT third-party providers, multi-vendor concentration risks, and substitutability.",
            "Art.29",
            "Vendor Concentration Risk Assessment & Due Diligence Dossiers",
        ),
        _c(
            "DORA-Art.30",
            "Key Contractual Provisions",
            d4,
            "Contracts with ICT service providers must include service levels, full audit/inspection rights, data location, and exit strategies.",
            "Art.30",
            "Contract Clauses Audit & Exit Strategy Documentation",
        ),
    ])

    # 5. Information-Sharing Arrangements (Art. 45)
    d5 = "Information-Sharing Arrangements"
    controls.extend([
        _c(
            "DORA-Art.45",
            "Threat Intelligence Information-Sharing",
            d5,
            "Participate in trusted information-sharing arrangements for cyber threats and tactical indicators of compromise.",
            "Art.45",
            "Information-Sharing Agreement & MISP/ISAC Participation Proof",
        ),
    ])

    return Framework(
        jurisdiction="EU",
        purpose_tags=["cybersecurity", "resilience", "financial", "dora"],
        id="dora-2022-2554",
        name="DORA (Regulation (EU) 2022/2554)",
        version="1.0",
        controls=controls,
    )
