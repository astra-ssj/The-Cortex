# compliance/gdpr.py — GDPR framework definition.
# Follows exact pattern in nist_csf.py: Framework with Controls, Requirements, EvidenceTypes.
# Real Article references for audit and mapping to regulation.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement


def get_gdpr() -> Framework:
    """Build and return the GDPR compliance framework. Same structure as nist_csf.get_nist_csf()."""
    return Framework(
        jurisdiction="EU",
        purpose_tags=["privacy", "gdpr", "data-protection"],
        id="gdpr-2016-679",
        name="GDPR 2016/679",
        version="1.0",
        controls=[
            Control(
                id="lawful-basis-consent",
                name="Lawful Basis & Consent",
                domain="Lawful Basis & Consent",
                requirements=[
                    Requirement(
                        id="lb-1",
                        article_ref="Art.6",
                        description="Processing must have a lawful basis (consent, contract, legal obligation, etc.).",
                        evidence_types=[
                            EvidenceType(id="basis-record", name="Lawful basis record", description="Record of basis per purpose"),
                            EvidenceType(id="dpia", name="DPIA", description="Data protection impact assessment where required"),
                        ],
                    ),
                    Requirement(
                        id="lb-2",
                        article_ref="Art.7",
                        description="Conditions for consent: demonstrable, clear, withdrawable.",
                        evidence_types=[
                            EvidenceType(id="consent-record", name="Consent record", description="Record of consent with time and scope"),
                            EvidenceType(id="withdrawal", name="Withdrawal mechanism", description="Evidence of withdrawal process"),
                        ],
                    ),
                ],
            ),
            Control(
                id="lawful-basis-consent-2",
                name="Lawful Basis – Contract",
                domain="Lawful Basis & Consent",
                requirements=[
                    Requirement(
                        id="lb-3",
                        article_ref="Art.6(1)(b)",
                        description="Processing necessary for contract performance.",
                        evidence_types=[EvidenceType(id="contract-basis", name="Contract basis record", description="Record of contractual basis")],
                    ),
                ],
            ),
            Control(
                id="lawful-basis-consent-3",
                name="Lawful Basis – Legitimate Interest",
                domain="Lawful Basis & Consent",
                requirements=[
                    Requirement(
                        id="lb-4",
                        article_ref="Art.6(1)(f)",
                        description="Legitimate interest assessment where used.",
                        evidence_types=[EvidenceType(id="lia", name="LIA", description="Legitimate interest assessment")],
                    ),
                ],
            ),
            Control(
                id="data-subject-rights",
                name="Data Subject Rights",
                domain="Data Subject Rights",
                requirements=[
                    Requirement(
                        id="dsr-1",
                        article_ref="Art.15",
                        description="Right of access: confirmation and copy of personal data.",
                        evidence_types=[
                            EvidenceType(id="access-log", name="Access request log", description="Log of access requests and responses"),
                        ],
                    ),
                    Requirement(
                        id="dsr-2",
                        article_ref="Art.16–22",
                        description="Rights to rectification, erasure, restriction, portability, object, and automated decision-making.",
                        evidence_types=[
                            EvidenceType(id="request-handling", name="Request handling record", description="Evidence of handling each right"),
                            EvidenceType(id="sla", name="SLA compliance", description="Response within 1 month where applicable"),
                        ],
                    ),
                ],
            ),
            Control(
                id="data-subject-rights-2",
                name="Right of Access – Procedures",
                domain="Data Subject Rights",
                requirements=[
                    Requirement(
                        id="dsr-3",
                        article_ref="Art.15",
                        description="Procedures for access requests and verification.",
                        evidence_types=[EvidenceType(id="procedure", name="Procedure doc", description="Documented procedure")],
                    ),
                ],
            ),
            Control(
                id="data-subject-rights-3",
                name="Right to Erasure",
                domain="Data Subject Rights",
                requirements=[
                    Requirement(
                        id="dsr-4",
                        article_ref="Art.17",
                        description="Right to erasure and exceptions.",
                        evidence_types=[EvidenceType(id="erasure-log", name="Erasure log", description="Record of erasure requests")],
                    ),
                ],
            ),
            Control(
                id="data-protection-by-design",
                name="Data Protection by Design",
                domain="Data Protection by Design",
                requirements=[
                    Requirement(
                        id="dpb-1",
                        article_ref="Art.25",
                        description="Data protection by design and by default: technical and organisational measures.",
                        evidence_types=[
                            EvidenceType(id="design-doc", name="Design documentation", description="Documented privacy-by-design decisions"),
                            EvidenceType(id="defaults", name="Default settings", description="Evidence of privacy-friendly defaults"),
                        ],
                    ),
                ],
            ),
            Control(
                id="data-protection-by-design-2",
                name="Privacy by Default",
                domain="Data Protection by Design",
                requirements=[
                    Requirement(
                        id="dpb-2",
                        article_ref="Art.25(2)",
                        description="Default settings ensure minimal personal data.",
                        evidence_types=[EvidenceType(id="default-audit", name="Default settings audit", description="Audit of defaults")],
                    ),
                ],
            ),
            Control(
                id="security-of-processing",
                name="Security of Processing",
                domain="Security of Processing",
                requirements=[
                    Requirement(
                        id="sec-1",
                        article_ref="Art.32",
                        description="Security of processing: appropriate technical and organisational measures.",
                        evidence_types=[
                            EvidenceType(id="risk-assessment", name="Risk assessment", description="Security risk assessment"),
                            EvidenceType(id="encryption", name="Encryption/ pseudonymisation", description="Where applicable"),
                            EvidenceType(id="testing", name="Testing and evaluation", description="Regular testing of measures"),
                        ],
                    ),
                ],
            ),
            Control(
                id="security-of-processing-2",
                name="Confidentiality and Integrity",
                domain="Security of Processing",
                requirements=[
                    Requirement(
                        id="sec-2",
                        article_ref="Art.32(1)(b)(c)",
                        description="Ability to ensure confidentiality and integrity of processing.",
                        evidence_types=[EvidenceType(id="confidentiality", name="Confidentiality measures", description="Documented measures")],
                    ),
                ],
            ),
            Control(
                id="security-of-processing-3",
                name="Resilience and Recovery",
                domain="Security of Processing",
                requirements=[
                    Requirement(
                        id="sec-3",
                        article_ref="Art.32(1)(b)",
                        description="Ability to restore availability and access after incident.",
                        evidence_types=[EvidenceType(id="recovery", name="Recovery procedures", description="Recovery and backup evidence")],
                    ),
                ],
            ),
            Control(
                id="breach-notification",
                name="Breach Notification",
                domain="Breach Notification",
                requirements=[
                    Requirement(
                        id="br-1",
                        article_ref="Art.33",
                        description="Notification to supervisory authority without undue delay (max 72h where feasible).",
                        evidence_types=[
                            EvidenceType(id="breach-log", name="Breach log", description="Record of breach and notification"),
                            EvidenceType(id="timeline", name="Timeline", description="Evidence of timing of detection and notification"),
                        ],
                    ),
                    Requirement(
                        id="br-2",
                        article_ref="Art.34",
                        description="Communication to data subjects when high risk to rights and freedoms.",
                        evidence_types=[
                            EvidenceType(id="communication-record", name="Communication record", description="Evidence of communication to individuals"),
                        ],
                    ),
                ],
            ),
            Control(
                id="breach-notification-2",
                name="Breach Documentation",
                domain="Breach Notification",
                requirements=[
                    Requirement(
                        id="br-3",
                        article_ref="Art.33(5)",
                        description="Documentation of breaches and notifications.",
                        evidence_types=[EvidenceType(id="breach-doc", name="Breach documentation", description="Documentation of breach events")],
                    ),
                ],
            ),
            Control(
                id="dpo-requirements",
                name="DPO Requirements",
                domain="DPO Requirements",
                requirements=[
                    Requirement(
                        id="dpo-1",
                        article_ref="Art.37",
                        description="Designation of DPO where required (public authority, large-scale monitoring, etc.).",
                        evidence_types=[
                            EvidenceType(id="dpo-designation", name="DPO designation", description="Record of designation and contact"),
                        ],
                    ),
                    Requirement(
                        id="dpo-2",
                        article_ref="Art.38–39",
                        description="DPO position, tasks, and cooperation with supervisory authority.",
                        evidence_types=[
                            EvidenceType(id="dpo-tasks", name="DPO tasks record", description="Documentation of tasks and involvement"),
                            EvidenceType(id="cooperation", name="Cooperation record", description="Evidence of cooperation with SA"),
                        ],
                    ),
                ],
            ),
            Control(
                id="dpo-requirements-2",
                name="DPO Resources",
                domain="DPO Requirements",
                requirements=[
                    Requirement(
                        id="dpo-3",
                        article_ref="Art.38(2)",
                        description="Adequate resources and support for DPO.",
                        evidence_types=[EvidenceType(id="dpo-resources", name="DPO resources", description="Evidence of resources")],
                    ),
                ],
            ),
            Control(
                id="international-transfers",
                name="International Transfers",
                domain="International Transfers",
                requirements=[
                    Requirement(
                        id="xfer-1",
                        article_ref="Art.44–49",
                        description="Transfers only where adequate protection or appropriate safeguards (SCCs, BCRs, etc.).",
                        evidence_types=[
                            EvidenceType(id="transfer-map", name="Transfer map", description="Record of transfers and legal basis"),
                            EvidenceType(id="sccs", name="SCCs / BCRs", description="Standard contractual clauses or binding corporate rules"),
                        ],
                    ),
                ],
            ),
            Control(
                id="international-transfers-2",
                name="Transfer Impact Assessment",
                domain="International Transfers",
                requirements=[
                    Requirement(
                        id="xfer-2",
                        article_ref="Art.46",
                        description="Assessment of third country protection where safeguards used.",
                        evidence_types=[EvidenceType(id="tia", name="TIA", description="Transfer impact assessment")],
                    ),
                ],
            ),
            Control(
                id="international-transfers-3",
                name="Adequacy and Derogations",
                domain="International Transfers",
                requirements=[
                    Requirement(
                        id="xfer-3",
                        article_ref="Art.45–49",
                        description="Transfers to adequate countries or with derogations.",
                        evidence_types=[EvidenceType(id="adequacy", name="Adequacy record", description="Record of adequacy or derogation")],
                    ),
                ],
            ),
            Control(
                id="accountability",
                name="Accountability",
                domain="Accountability",
                requirements=[
                    Requirement(
                        id="acc-1",
                        article_ref="Art.5",
                        description="Principles: lawfulness, fairness, transparency; purpose limitation; data minimisation; accuracy; storage limitation; integrity and confidentiality.",
                        evidence_types=[
                            EvidenceType(id="privacy-notice", name="Privacy notice", description="Transparency and lawful basis"),
                            EvidenceType(id="retention", name="Retention schedule", description="Storage limitation evidence"),
                        ],
                    ),
                    Requirement(
                        id="acc-2",
                        article_ref="Art.24",
                        description="Controller responsibility: demonstrate compliance with Art.5 and implement appropriate measures.",
                        evidence_types=[
                            EvidenceType(id="policies", name="Policies and procedures", description="Documented measures"),
                            EvidenceType(id="records", name="Records of processing", description="ROPA / Art.30 records"),
                        ],
                    ),
                ],
            ),
            Control(
                id="accountability-2",
                name="Documentation of Compliance",
                domain="Accountability",
                requirements=[
                    Requirement(
                        id="acc-3",
                        article_ref="Art.5(2)",
                        description="Controller must be able to demonstrate compliance.",
                        evidence_types=[EvidenceType(id="compliance-doc", name="Compliance documentation", description="Documentation of compliance")],
                    ),
                ],
            ),
            Control(
                id="accountability-3",
                name="Processor Agreements",
                domain="Accountability",
                requirements=[
                    Requirement(
                        id="acc-4",
                        article_ref="Art.28",
                        description="Processor contracts with required clauses.",
                        evidence_types=[EvidenceType(id="dpa", name="DPA", description="Data processing agreements")],
                    ),
                ],
            ),
            Control(
                id="accountability-4",
                name="Records of Processing",
                domain="Accountability",
                requirements=[
                    Requirement(
                        id="acc-5",
                        article_ref="Art.30",
                        description="Records of processing activities (ROPA).",
                        evidence_types=[EvidenceType(id="ropa", name="ROPA", description="Records of processing activities")],
                    ),
                ],
            ),
            Control(
                id="accountability-5",
                name="Cooperation with Supervisory Authority",
                domain="Accountability",
                requirements=[
                    Requirement(
                        id="acc-6",
                        article_ref="Art.31",
                        description="Cooperation with the supervisory authority.",
                        evidence_types=[EvidenceType(id="cooperation", name="Cooperation record", description="Evidence of cooperation with SA")],
                    ),
                ],
            ),
            Control(
                id="lawful-basis-consent-4",
                name="Children's Consent",
                domain="Lawful Basis & Consent",
                requirements=[
                    Requirement(
                        id="lb-5",
                        article_ref="Art.8",
                        description="Conditions applicable to child's consent in relation to information society services.",
                        evidence_types=[EvidenceType(id="child-consent", name="Child consent mechanism", description="Verification of parental responsibility")],
                    ),
                ],
            ),
            Control(
                id="data-subject-rights-4",
                name="Right to Object",
                domain="Data Subject Rights",
                requirements=[
                    Requirement(
                        id="dsr-5",
                        article_ref="Art.21",
                        description="Right to object to processing and to direct marketing.",
                        evidence_types=[EvidenceType(id="object-handling", name="Objection handling", description="Record of objection handling")],
                    ),
                ],
            ),
        ],
    )
