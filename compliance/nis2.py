# compliance/nis2.py — NIS2 Directive framework definition.
# Follows exact pattern in nist_csf.py: Framework with Controls, Requirements, EvidenceTypes.
# Real Article references for audit and mapping to regulation.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement


def get_nis2() -> Framework:
    """Build and return the NIS2 compliance framework. Same structure as nist_csf.get_nist_csf()."""
    return Framework(
        jurisdiction="EU",
        purpose_tags=["cybersecurity", "nis2", "critical-infrastructure"],
        id="nis2",
        name="Directive (EU) 2022/2555 (NIS2)",
        version="1.0",
        controls=[
            Control(
                id="risk-management-measures",
                name="Risk Management Measures",
                domain="Risk Management Measures",
                requirements=[
                    Requirement(
                        id="rmm-1",
                        article_ref="Art.21",
                        description="Risk management measures: policies on risk analysis and security.",
                        evidence_types=[
                            EvidenceType(id="risk-policy", name="Risk management policy", description="Documented policies and measures"),
                            EvidenceType(id="risk-assessment", name="Risk assessment", description="Risk analysis and evaluation"),
                        ],
                    ),
                ],
            ),
            Control(
                id="incident-reporting",
                name="Incident Reporting",
                domain="Incident Reporting",
                requirements=[
                    Requirement(
                        id="ir-1",
                        article_ref="Art.23",
                        description="Early warning: without undue delay and in any event within 24 hours of awareness.",
                        evidence_types=[
                            EvidenceType(id="early-warning-log", name="Early warning log", description="Record of 24h early warning to CSIRT/authority"),
                        ],
                    ),
                    Requirement(
                        id="ir-2",
                        article_ref="Art.23",
                        description="Incident notification: without undue delay and in any event within 72 hours of awareness.",
                        evidence_types=[
                            EvidenceType(id="notification-log", name="Notification log", description="Record of 72h notification with assessment"),
                            EvidenceType(id="final-report", name="Final report", description="Final report within one month where applicable"),
                        ],
                    ),
                ],
            ),
            Control(
                id="business-continuity",
                name="Business Continuity",
                domain="Business Continuity",
                requirements=[
                    Requirement(
                        id="bc-1",
                        article_ref="Art.21.2.c",
                        description="Business continuity and crisis management (backup, disaster recovery, crisis management).",
                        evidence_types=[
                            EvidenceType(id="bcp", name="Business continuity plan", description="Documented BCP and crisis management"),
                            EvidenceType(id="backup-dr", name="Backup and DR evidence", description="Backup and disaster recovery testing"),
                        ],
                    ),
                ],
            ),
            Control(
                id="supply-chain-security",
                name="Supply Chain Security",
                domain="Supply Chain Security",
                requirements=[
                    Requirement(
                        id="scs-1",
                        article_ref="Art.21.2.d",
                        description="Supply chain security: security of network and information systems and their physical environment.",
                        evidence_types=[
                            EvidenceType(id="supplier-assessment", name="Supplier security assessment", description="Assessment of critical suppliers"),
                            EvidenceType(id="contractual-security", name="Contractual security", description="Security requirements in supplier contracts"),
                        ],
                    ),
                ],
            ),
            Control(
                id="vulnerability-disclosure",
                name="Vulnerability Disclosure",
                domain="Vulnerability Disclosure",
                requirements=[
                    Requirement(
                        id="vd-1",
                        article_ref="Art.12",
                        description="Vulnerability disclosure: coordinated disclosure and handling of vulnerabilities.",
                        evidence_types=[
                            EvidenceType(id="disclosure-policy", name="Disclosure policy", description="Vulnerability disclosure and handling policy"),
                            EvidenceType(id="disclosure-log", name="Disclosure log", description="Record of received and disclosed vulnerabilities"),
                        ],
                    ),
                ],
            ),
            Control(
                id="supervisory-enforcement",
                name="Supervisory & Enforcement",
                domain="Supervisory & Enforcement",
                requirements=[
                    Requirement(
                        id="se-1",
                        article_ref="Art.32",
                        description="Supervisory and enforcement measures at Member State level.",
                        evidence_types=[
                            EvidenceType(id="cooperation-record", name="Cooperation record", description="Evidence of cooperation with competent authority"),
                        ],
                    ),
                    Requirement(
                        id="se-2",
                        article_ref="Art.33–34",
                        description="Enforcement: administrative fines and periodic penalty payments; review and appeal.",
                        evidence_types=[
                            EvidenceType(id="compliance-record", name="Compliance record", description="Evidence of compliance with supervisory decisions"),
                        ],
                    ),
                ],
            ),
        ],
    )
