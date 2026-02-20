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
        id="gdpr",
        name="General Data Protection Regulation",
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
        ],
    )
