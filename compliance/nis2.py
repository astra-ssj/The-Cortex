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
        id="nis2-2022-2555",
        name="NIS2 Directive",
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
                id="risk-management-measures-2",
                name="Risk Analysis",
                domain="Risk Management Measures",
                requirements=[
                    Requirement(
                        id="rmm-2",
                        article_ref="Art.21",
                        description="Regular risk analysis and security policies.",
                        evidence_types=[EvidenceType(id="risk-analysis", name="Risk analysis", description="Documented risk analysis")],
                    ),
                ],
            ),
            Control(
                id="risk-management-measures-3",
                name="Security Measures",
                domain="Risk Management Measures",
                requirements=[
                    Requirement(
                        id="rmm-3",
                        article_ref="Art.21.2",
                        description="Technical and organisational security measures.",
                        evidence_types=[EvidenceType(id="security-measures", name="Security measures", description="Documented measures")],
                    ),
                ],
            ),
            Control(
                id="risk-management-measures-4",
                name="Cryptography",
                domain="Risk Management Measures",
                requirements=[
                    Requirement(
                        id="rmm-4",
                        article_ref="Art.21.2",
                        description="Use of cryptography where appropriate.",
                        evidence_types=[EvidenceType(id="crypto", name="Cryptography policy", description="Crypto and key management")],
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
                id="incident-reporting-2",
                name="Incident Handling",
                domain="Incident Reporting",
                requirements=[
                    Requirement(
                        id="ir-3",
                        article_ref="Art.23",
                        description="Internal incident handling and escalation.",
                        evidence_types=[EvidenceType(id="incident-handling", name="Incident handling", description="Incident handling procedures")],
                    ),
                ],
            ),
            Control(
                id="incident-reporting-3",
                name="Early Warning Content",
                domain="Incident Reporting",
                requirements=[
                    Requirement(
                        id="ir-4",
                        article_ref="Art.23",
                        description="Content of early warning notification.",
                        evidence_types=[EvidenceType(id="early-warning-content", name="Early warning template", description="Notification content requirements")],
                    ),
                ],
            ),
            Control(
                id="incident-reporting-4",
                name="Final Report",
                domain="Incident Reporting",
                requirements=[
                    Requirement(
                        id="ir-5",
                        article_ref="Art.23",
                        description="Final incident report within one month.",
                        evidence_types=[EvidenceType(id="final-report-doc", name="Final report", description="Final incident report")],
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
                id="business-continuity-2",
                name="Crisis Management",
                domain="Business Continuity",
                requirements=[
                    Requirement(
                        id="bc-2",
                        article_ref="Art.21.2.c",
                        description="Crisis management and recovery.",
                        evidence_types=[EvidenceType(id="crisis-mgmt", name="Crisis management", description="Crisis management plan")],
                    ),
                ],
            ),
            Control(
                id="business-continuity-3",
                name="Backup and DR",
                domain="Business Continuity",
                requirements=[
                    Requirement(
                        id="bc-3",
                        article_ref="Art.21.2.c",
                        description="Backup and disaster recovery capabilities.",
                        evidence_types=[EvidenceType(id="backup-dr", name="Backup/DR", description="Backup and DR evidence")],
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
                id="supply-chain-security-2",
                name="Supplier Security",
                domain="Supply Chain Security",
                requirements=[
                    Requirement(
                        id="scs-2",
                        article_ref="Art.21.2.d",
                        description="Security of supply chain and suppliers.",
                        evidence_types=[EvidenceType(id="supplier-security", name="Supplier security", description="Supplier security assessment")],
                    ),
                ],
            ),
            Control(
                id="supply-chain-security-3",
                name="Physical and Environmental",
                domain="Supply Chain Security",
                requirements=[
                    Requirement(
                        id="scs-3",
                        article_ref="Art.21.2.d",
                        description="Physical and environmental security of systems.",
                        evidence_types=[EvidenceType(id="physical-env", name="Physical security", description="Physical and environmental controls")],
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
                id="vulnerability-disclosure-2",
                name="Vulnerability Handling",
                domain="Vulnerability Disclosure",
                requirements=[
                    Requirement(
                        id="vd-2",
                        article_ref="Art.12",
                        description="Handling and disclosure of vulnerabilities.",
                        evidence_types=[EvidenceType(id="vuln-handling", name="Vulnerability handling", description="Vulnerability handling process")],
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
            Control(
                id="supervisory-enforcement-2",
                name="Cooperation with Authority",
                domain="Supervisory & Enforcement",
                requirements=[
                    Requirement(
                        id="se-3",
                        article_ref="Art.32",
                        description="Cooperation with competent authorities.",
                        evidence_types=[EvidenceType(id="cooperation", name="Cooperation", description="Evidence of cooperation")],
                    ),
                ],
            ),
            Control(
                id="supervisory-enforcement-3",
                name="Enforcement and Appeals",
                domain="Supervisory & Enforcement",
                requirements=[
                    Requirement(
                        id="se-4",
                        article_ref="Art.33–34",
                        description="Compliance with enforcement and appeal rights.",
                        evidence_types=[EvidenceType(id="enforcement", name="Enforcement record", description="Enforcement and appeal evidence")],
                    ),
                ],
            ),
            Control(
                id="risk-management-measures-5",
                name="Security Testing",
                domain="Risk Management Measures",
                requirements=[
                    Requirement(
                        id="rmm-5",
                        article_ref="Art.21",
                        description="Testing and evaluation of security measures.",
                        evidence_types=[EvidenceType(id="security-testing", name="Security testing", description="Testing and evaluation evidence")],
                    ),
                ],
            ),
        ],
    )
