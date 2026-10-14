# compliance/iso42001.py — ISO/IEC 42001:2023 Artificial Intelligence Management System (AIMS).
# Mapped directly from content/skills/extracted/iso42001/iso42001/SKILL.md and references.
# Exactly 9 domains covering all 38 Annex A controls.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement

_E = EvidenceType


def _c(cid: str, name: str, domain: str, desc: str, article: str, ev_name: str) -> Control:
    return Control(
        id=cid,
        name=name,
        domain=domain,
        requirements=[
            Requirement(
                id=f"{cid}-req",
                article_ref=article,
                description=desc,
                evidence_types=[_E(id=f"{cid}-ev", name=ev_name, description=desc)],
            )
        ],
    )


def get_iso42001() -> Framework:
    """Build and return ISO/IEC 42001:2023 compliance framework (all 38 Annex A controls)."""
    controls: list[Control] = []

    # A.2 Policies Related to AI (3 controls)
    d2 = "Policies Related to AI"
    controls.extend([
        _c("ISO42001-A.2.2", "AI policy", d2, "Formal AI policy established, documented, communicated, and signed by top management.", "A.2.2", "Approved AI Policy Document"),
        _c("ISO42001-A.2.3", "Alignment with other organisational policies", d2, "AI-specific requirements incorporated into HR, procurement, IT, and security policies.", "A.2.3", "Integrated Organizational Policy Addenda"),
        _c("ISO42001-A.2.4", "Review of the AI policy", d2, "AI policy reviewed at planned intervals and when significant changes occur.", "A.2.4", "AI Policy Review Records & Audit Minutes"),
    ])

    # A.3 Internal Organisation (2 controls)
    d3 = "Internal Organisation"
    controls.extend([
        _c("ISO42001-A.3.2", "AI roles and responsibilities", d3, "Roles and responsibilities for AI governance defined, assigned, and documented.", "A.3.2", "AI Governance RACI Matrix & Role Descriptions"),
        _c("ISO42001-A.3.3", "Reporting of concerns", d3, "Whistleblowing and reporting channels established for AI safety, bias, and ethics concerns.", "A.3.3", "AI Whistleblowing & Concern Reporting Procedure"),
    ])

    # A.4 Resources for AI Systems (5 controls)
    d4 = "Resources for AI Systems"
    controls.extend([
        _c("ISO42001-A.4.2", "Resource documentation", d4, "Resources required to develop, deploy, and maintain AI systems identified and documented.", "A.4.2", "AI Resource Inventory & Allocation Plan"),
        _c("ISO42001-A.4.3", "Data resources", d4, "Policies and controls governing training, validation, and testing data resources.", "A.4.3", "Data Resource Governance & Quality Guidelines"),
        _c("ISO42001-A.4.4", "Tooling resources", d4, "Controls governing selection, procurement, and management of AI development tooling.", "A.4.4", "AI Tooling Registry & Security Verification"),
        _c("ISO42001-A.4.5", "System and computing resources", d4, "Controls governing compute infrastructure, access control, and capacity management.", "A.4.5", "Compute Infrastructure Allocation & Access Logs"),
        _c("ISO42001-A.4.6", "Human resources", d4, "Documented AI competencies, staff training programmes, and AI awareness initiatives.", "A.4.6", "AI Competency Framework & Training Records"),
    ])

    # A.5 Assessing Impacts of AI Systems (4 controls)
    d5 = "Assessing Impacts of AI Systems"
    controls.extend([
        _c("ISO42001-A.5.2", "AI system impact assessment process", d5, "Documented methodology and process for assessing impacts of AI systems (AISIA).", "A.5.2", "AISIA Methodology & Assessment Procedure"),
        _c("ISO42001-A.5.3", "Documentation of AI system impact assessments", d5, "Impact assessment reports documented, retained, and updated upon significant changes.", "A.5.3", "Completed AISIA Reports"),
        _c("ISO42001-A.5.4", "Impact on individuals or groups", d5, "Assess impact on fundamental human rights, fairness, bias, and automated decision-making.", "A.5.4", "Fundamental Rights & Non-Discrimination Assessment"),
        _c("ISO42001-A.5.5", "Assessing societal impacts", d5, "Evaluate broader societal, labour market, democratic, and environmental impacts of AI.", "A.5.5", "Societal & Environmental Impact Evaluation"),
    ])

    # A.6 AI System Life Cycle (9 controls)
    d6 = "AI System Life Cycle"
    controls.extend([
        _c("ISO42001-A.6.1.2", "Objectives for responsible development", d6, "Measurable objectives established for fairness, transparency, and safety in AI.", "A.6.1.2", "Responsible AI Objectives Specification"),
        _c("ISO42001-A.6.1.3", "Processes for responsible AI design", d6, "Processes governing responsible AI design, explainability, and development gates.", "A.6.1.3", "Responsible AI Engineering Guidelines"),
        _c("ISO42001-A.6.2.2", "AI system requirements and specification", d6, "Intended purpose, performance criteria, constraints, and operational bounds documented.", "A.6.2.2", "AI System Specification Dossier"),
        _c("ISO42001-A.6.2.3", "Documentation of design and development", d6, "Design rationale, architecture, hyperparameters, and model versions documented.", "A.6.2.3", "Model Card & Architecture Design Document"),
        _c("ISO42001-A.6.2.4", "AI system verification and validation", d6, "Benchmarking, demographic bias testing, adversarial robustness, and validation gates.", "A.6.2.4", "AI Verification & Validation Test Reports"),
        _c("ISO42001-A.6.2.5", "AI system deployment", d6, "Controlled deployment process, staged release, sign-offs, and rollback procedures.", "A.6.2.5", "Deployment Release Authorisation & Rollback Plan"),
        _c("ISO42001-A.6.2.6", "Operation and monitoring", d6, "Continuous monitoring for model drift, concept drift, performance degradation, and bias.", "A.6.2.6", "Model Performance & Drift Monitoring Dashboard"),
        _c("ISO42001-A.6.2.7", "Technical documentation", d6, "Comprehensive technical documentation maintained for transparency and regulatory review.", "A.6.2.7", "Comprehensive System Technical Dossier"),
        _c("ISO42001-A.6.2.8", "Recording of event logs", d6, "Comprehensive event logging capturing system inputs, outputs, anomalies, and operations.", "A.6.2.8", "AI Audit Logging Records & Immutable Logs"),
    ])

    # A.7 Data for AI Systems (5 controls)
    d7 = "Data for AI Systems"
    controls.extend([
        _c("ISO42001-A.7.2", "Data for development and enhancement of AI system", d7, "Data governance framework defining management across full AI data lifecycle.", "A.7.2", "AI Data Lifecycle Governance Framework"),
        _c("ISO42001-A.7.3", "Acquisition of data", d7, "Controls governing training, validation, and test data sourcing, licensing, and consent.", "A.7.3", "Data Acquisition & Licensing Records"),
        _c("ISO42001-A.7.4", "Quality of data for AI systems", d7, "Data quality criteria defined and tested for completeness, accuracy, and noise.", "A.7.4", "Data Quality Assessment Report"),
        _c("ISO42001-A.7.5", "Data provenance", d7, "End-to-end data lineage tracked from raw source through preprocessing to model input.", "A.7.5", "Data Lineage & Provenance Metadata"),
        _c("ISO42001-A.7.6", "Data preparation", d7, "Documented procedures for data transformation, cleaning, labeling, and feature engineering.", "A.7.6", "Data Preparation & Labeling Protocol"),
    ])

    # A.8 Information for Interested Parties of AI Systems (4 controls)
    d8 = "Information for Interested Parties"
    controls.extend([
        _c("ISO42001-A.8.2", "System documentation and information for users", d8, "Clear transparency notices disclosing AI interaction, capabilities, and limitations.", "A.8.2", "User AI Transparency Notice & System Documentation"),
        _c("ISO42001-A.8.3", "External reporting", d8, "Processes for reporting AI system characteristics and compliance to regulators and auditors.", "A.8.3", "External Audit & Regulatory Filing Records"),
        _c("ISO42001-A.8.4", "Communication of incidents", d8, "Procedures for prompt communication of AI incidents to affected users and regulators.", "A.8.4", "AI Incident Communication Protocol"),
        _c("ISO42001-A.8.5", "Information for interested parties", d8, "Stakeholders informed of rights and what to expect from AI systems.", "A.8.5", "Stakeholder AI Information Plan"),
    ])

    # A.9 Use of AI Systems (3 controls)
    d9 = "Use of AI Systems"
    controls.extend([
        _c("ISO42001-A.9.2", "Processes for responsible use of AI systems", d9, "Rules and guardrails governing ethical and safe usage of AI tools by workforce.", "A.9.2", "Acceptable AI Use Policy & Staff Guidelines"),
        _c("ISO42001-A.9.3", "Objectives for responsible use of AI system", d9, "Measurable objectives for responsible AI use established and monitored.", "A.9.3", "Responsible AI Use Objectives & Review Metrics"),
        _c("ISO42001-A.9.4", "Intended use of the AI system", d9, "Controls ensuring AI systems are operated strictly within specified intended operational bounds.", "A.9.4", "Operational Boundary Controls & Misuse Prevention"),
    ])

    # A.10 Third-party and Customer Relationships (3 controls)
    d10 = "Third-party and Customer Relationships"
    controls.extend([
        _c("ISO42001-A.10.2", "Allocating responsibilities", d10, "Responsibilities clearly allocated between AI provider, integrator, and user.", "A.10.2", "Third-Party Responsibility Allocation Agreement"),
        _c("ISO42001-A.10.3", "Suppliers", d10, "Due diligence, supply chain security, and risk monitoring for foundational model vendors.", "A.10.3", "AI Vendor Due Diligence & SLA Records"),
        _c("ISO42001-A.10.4", "Customers", d10, "Documentation communicating customer responsibilities and safe deployment prerequisites.", "A.10.4", "Customer Shared Responsibility Matrix"),
    ])

    return Framework(
        jurisdiction="international",
        purpose_tags=["ai", "governance", "management-system", "iso42001"],
        id="iso42001-2023",
        name="ISO/IEC 42001:2023 (AIMS)",
        version="1.0",
        controls=controls,
    )
