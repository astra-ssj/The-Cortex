"""Generate the reviewed launch curriculum artifacts.

The generated SQL is self-contained: production migration runners never read
instruction-bearing source material or this generator at runtime.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REVIEWED_AT = "2026-10-25T12:00:00Z"
REVIEWER = "Astra Curriculum Review Board"
SOURCE_REPOSITORY = "https://github.com/better-isms/grcskills"
SOURCE_RELEASE = "v2026.10.19.2"
SOURCE_COMMIT = "e99f09d4b836bcf596e032a8ab0dc54668faf4d5"


def _sha(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()


EXISTING = [
    {
        "id": "cloud-access-onboarding",
        "scenario_slug": "cloud_access_onboarding",
        "title": "Privileged cloud access decision",
        "summary": "Apply least privilege and proportionate escalation to a time-pressured production access request.",
        "category": "access-control",
        "frameworks": ["iso27001", "nist-csf"],
        "tags": ["access", "least-privilege", "escalation"],
        "difficulty": "foundation",
        "estimated_minutes": 12,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": [
            "Apply least privilege under delivery pressure",
            "Separate justified access from broad convenience access",
            "Escalate unresolved privilege decisions without bypassing approval",
        ],
        "persona": "DevOps Lead",
    },
    {
        "id": "supplier-incident-response",
        "scenario_slug": "supplier_incident_response",
        "title": "Supplier incident response",
        "summary": "Coordinate a supplier breach response while preserving facts, contracts, and notification decisions.",
        "category": "incidents-continuity",
        "frameworks": ["iso27001", "gdpr"],
        "tags": ["supplier", "incident", "notification"],
        "difficulty": "practitioner",
        "estimated_minutes": 15,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": [
            "Invoke contractual incident duties",
            "Preserve notification evidence and clocks",
            "Escalate privacy decisions using verified facts",
        ],
        "persona": "Supplier Account Manager",
    },
    {
        "id": "change-management-failure",
        "scenario_slug": "change_management_failure",
        "title": "Emergency change failure",
        "summary": "Respond to an emergency production change that bypassed approval and caused an outage.",
        "category": "operations",
        "frameworks": ["iso27001"],
        "tags": ["change-management", "incident", "corrective-action"],
        "difficulty": "practitioner",
        "estimated_minutes": 15,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": [
            "Preserve the technical timeline",
            "Distinguish recovery from process correction",
            "Raise a proportionate nonconformity",
        ],
        "persona": "Engineering Lead",
    },
    {
        "id": "asset-classification-breach",
        "scenario_slug": "asset_classification_breach",
        "title": "Asset classification breach",
        "summary": "Contain and disclose sensitive data found on an unclassified shared drive before an audit.",
        "category": "information-handling",
        "frameworks": ["iso27001"],
        "tags": ["classification", "evidence", "audit"],
        "difficulty": "practitioner",
        "estimated_minutes": 15,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": [
            "Contain exposure without destroying evidence",
            "Correct classification and ownership records",
            "Disclose the issue honestly during audit",
        ],
        "persona": "Junior Security Analyst",
    },
    {
        "id": "ransomware-group-response",
        "scenario_slug": "ransomware_group_response",
        "title": "Group ransomware response",
        "summary": "Direct group-wide containment, recovery, and executive communication during ransomware.",
        "category": "incidents-continuity",
        "frameworks": ["iso27001", "dora"],
        "tags": ["ransomware", "continuity", "executive-escalation"],
        "difficulty": "expert",
        "estimated_minutes": 20,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": [
            "Invoke continuity and isolate affected systems",
            "Preserve forensic evidence before restoration",
            "Stage accurate executive and regulatory communication",
        ],
        "persona": "Group SOC Lead",
    },
    {
        "id": "evidence-freshness-check",
        "scenario_slug": "evidence_freshness_audit",
        "title": "Evidence freshness check",
        "summary": "Challenge stale, undated, unowned, and incomplete audit evidence before it reaches an auditor.",
        "category": "evidence",
        "frameworks": ["general", "iso27001", "soc2"],
        "tags": ["evidence", "audit-readiness", "audit-period"],
        "difficulty": "foundation",
        "estimated_minutes": 12,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": [
            "Use the date inside an artefact rather than its file modification date",
            "Count recurring evidence by expected occurrence across the audit period",
            "Choose an honest refresh action without recreating historical evidence",
        ],
        "persona": "Audit Manager",
        "content_hash": "713d89b9b3f74106c82d322c91e3dbfbe7c8e3ba738a464fd31734a138abe954",
    },
]


def stage(
    slug: str,
    prompt: str,
    demand: str,
    correct: str,
    qualified: str,
    failure: str,
    defer: str,
    control_refs: list[str],
) -> dict[str, Any]:
    return {
        "slug": slug,
        "prompt": prompt,
        "demands": [demand, "Explain the evidence and escalation basis for the decision"],
        "control_refs": control_refs,
        "choices": {
            "correct": correct,
            "qualified": qualified,
            "failure": failure,
            "defer": defer,
        },
    }


NEW = [
    {
        "id": "incident-severity-triage",
        "scenario_slug": "incident_severity_triage",
        "title": "Incident severity triage",
        "summary": "Classify a live incident by impact, preserve evidence, start applicable clocks, and escalate proportionately.",
        "category": "incidents-continuity",
        "frameworks": ["iso27001", "nis2", "dora"],
        "tags": ["incident-response", "severity", "triage"],
        "difficulty": "practitioner",
        "estimated_minutes": 15,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": ["Anchor severity in business impact", "Preserve detection and awareness times", "Escalate against defined thresholds"],
        "persona": "Incident Commander",
        "stages": [
            stage("impact_assessment", "Customer authentication is failing in two regions, but alert volume is modest. Operations asks whether this is only a low-severity technical event.", "Classify the initial severity from known impact", "Declare a provisional high-severity incident, record impact and assumptions, and appoint an incident lead", "Open a medium-severity incident while explicitly setting a 15-minute impact reassessment trigger", "Classify it low because only a few alerts fired", "Wait for a complete root cause before opening an incident", ["a.5.24", "a.5.25"]),
            stage("clock_and_evidence", "The team can restore service quickly, but the exact detection and business-awareness times differ across logs and chat.", "Protect the timeline and applicable reporting clocks", "Record both timestamps with sources, preserve logs, and ask legal to determine which clock applies", "Record the earliest supportable timestamp and flag the unresolved awareness time for immediate review", "Use the later timestamp to maximize the reporting window", "Restore first and reconstruct timestamps from memory tomorrow", ["a.5.25", "a.5.28"]),
            stage("severity_reassessment", "Service is restored, but 18,000 customers were unable to authenticate and regulated transactions were delayed.", "Reassess severity and escalation after containment", "Keep the incident major, escalate regulatory assessment, and document why restoration does not erase impact", "Downgrade only operational urgency while retaining major-incident reporting and evidence duties", "Close as minor because service is now restored", "Leave severity unchanged without documenting the new facts", ["a.5.26", "a.5.27"]),
        ],
    },
    {
        "id": "nonconformity-root-cause-and-corrective-action",
        "scenario_slug": "nonconformity_corrective_action",
        "title": "Nonconformity root cause and corrective action",
        "summary": "Separate correction from corrective action and build an evidenced response that prevents recurrence.",
        "category": "audit",
        "frameworks": ["iso27001", "iso42001"],
        "tags": ["nonconformity", "root-cause", "corrective-action"],
        "difficulty": "practitioner",
        "estimated_minutes": 16,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": ["Separate containment from systemic correction", "Trace causes to controlled processes", "Define an extent check and effectiveness test"],
        "persona": "Process Owner",
        "stages": [
            stage("containment", "An auditor found six leavers with active accounts. Identity has now disabled those six accounts and asks to close the finding.", "Separate immediate correction from corrective action", "Record the disablement as correction, preserve the sample, and open root-cause work", "Accept the correction temporarily but keep the nonconformity open with a dated root-cause owner", "Close because the sampled accounts are disabled", "Delete the sample after remediation to avoid duplicate records", ["clause.10.2", "a.5.18"]),
            stage("root_cause", "The owner says the cause was human error, but three HR feeds use different termination fields and one is not monitored.", "Identify a controllable root cause", "Trace the failure to inconsistent feed design and missing exception monitoring, supported by process evidence", "Record training weakness as a contributing cause while continuing analysis of feed and monitoring design", "Name the analyst who missed the tickets as the root cause", "Choose the quickest plausible cause without testing it", ["clause.10.2", "a.5.18"]),
            stage("effectiveness", "A workflow fix is ready. The owner proposes checking the original six accounts next week as proof of effectiveness.", "Design the extent and effectiveness checks", "Test all termination feeds, sample new leavers over two cycles, and define zero unexplained active accounts as the criterion", "Test all feeds once now and schedule a second-cycle review before closure", "Retest only the six corrected accounts", "Close when the code deploys without measuring outcomes", ["clause.10.2", "a.5.35"]),
        ],
    },
    {
        "id": "risk-acceptance-memo",
        "scenario_slug": "risk_acceptance_memo",
        "title": "Risk acceptance memo",
        "summary": "Test whether acceptance is justified and identify authority, conditions, expiry, and reopen triggers.",
        "category": "risk",
        "frameworks": ["iso27001", "dora"],
        "tags": ["risk-acceptance", "residual-risk", "exception"],
        "difficulty": "expert",
        "estimated_minutes": 18,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": ["Recognize treatment deferral disguised as acceptance", "Route acceptance to authorized ownership", "Require conditions, expiry, and reopen triggers"],
        "persona": "Business Risk Owner",
        "stages": [
            stage("decision_basis", "A legacy payment service cannot support MFA for administrators. The product team asks to accept the risk until replacement next year.", "Test whether the acceptance basis is complete", "Document threat, exposure, residual likelihood and impact, alternatives, and current compensating controls", "Draft a provisional memo using current facts but mark missing threat evidence as a blocker to final approval", "State that replacement cost alone justifies acceptance", "Copy last year's acceptance without reassessment", ["a.5.7", "a.5.15"]),
            stage("authority", "The product director offers to sign today, although the risk method assigns critical residual risks to the executive committee.", "Route the decision to valid authority", "Send the evidenced recommendation to the executive committee and record the product director as accountable owner, not approver", "Obtain interim written sponsorship from the director while prohibiting production expansion pending committee approval", "Let the director approve because they own the budget", "Treat silence from the committee as approval", ["a.5.1", "a.5.2"]),
            stage("conditions", "The committee will consider a six-month acceptance if the service remains isolated and monitored.", "Make acceptance bounded and reviewable", "Set an expiry, named conditions, monitoring evidence, and reopen triggers for exposure or control change", "Set a shorter review date and manual monitoring while automation evidence is completed", "Approve indefinitely because replacement is planned", "Use a calendar reminder without measurable conditions", ["a.5.1", "a.8.16"]),
        ],
    },
    {
        "id": "soa-exclusion-justification-review",
        "scenario_slug": "soa_exclusion_review",
        "title": "Statement of Applicability exclusion review",
        "summary": "Challenge control exclusions against activities, assets, suppliers, risks, and commitments.",
        "category": "statement-of-applicability",
        "frameworks": ["iso27001", "iso42001"],
        "tags": ["soa", "exclusion", "applicability"],
        "difficulty": "expert",
        "estimated_minutes": 18,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": ["Test exclusions against organizational facts", "Reject outsourcing as automatic exclusion", "Keep, rewrite, reverse, or investigate an exclusion"],
        "persona": "ISMS Manager",
        "stages": [
            stage("fact_test", "The SoA excludes secure coding because the company says it does not develop software, yet engineers maintain deployment scripts and customer integrations.", "Test the exclusion against actual activities", "Map the scripts and integrations to development activities and reopen applicability with asset and risk evidence", "Suspend the exclusion while scoping whether maintained code creates material information-security risk", "Keep the exclusion because the company is not a software vendor", "Ask engineering to rename scripts as configuration", ["a.8.25", "a.8.26"]),
            stage("supplier_test", "Malware protection is excluded because endpoint management is outsourced to a managed service provider.", "Assess whether outsourcing removes applicability", "Reverse the exclusion and describe supplier-operated implementation plus retained oversight", "Rewrite it as applicable but externally operated, pending evidence of monitoring responsibilities", "Keep it excluded because the supplier performs the work", "Remove the supplier from ISMS scope to preserve the exclusion", ["a.5.19", "a.5.22"]),
            stage("approval_record", "The revised SoA now has evidence links, but two control owners disagree with the applicability conclusion.", "Resolve and record the applicability decision", "Escalate the reasoned decision to authorized ISMS governance and record dissent, evidence, and review date", "Publish a provisional status with unresolved items visibly marked and a near-term governance decision", "Let the document owner decide privately", "Delete dissenting comments before approval", ["a.5.1", "a.5.2"]),
        ],
    },
    {
        "id": "audit-sampling-evidence-sufficiency",
        "scenario_slug": "audit_sampling_evidence_sufficiency",
        "title": "Audit sampling and evidence sufficiency",
        "summary": "Design a defensible sample, evaluate exceptions, and decide when evidence is sufficient.",
        "category": "evidence",
        "frameworks": ["iso27001", "soc2"],
        "tags": ["audit", "sampling", "evidence-sufficiency"],
        "difficulty": "practitioner",
        "estimated_minutes": 16,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": ["Define the population before sampling", "Avoid convenience and replacement bias", "Expand or qualify testing when exceptions occur"],
        "persona": "Lead Auditor",
        "stages": [
            stage("population", "The owner offers ten successful access reviews selected from a folder, but cannot state how many reviews should have occurred.", "Establish the population before selecting a sample", "Reconcile the expected population from the control frequency, systems, and period before sampling", "Use the folder list provisionally but require reconciliation before drawing a conclusion", "Accept ten successful records as the population", "Sample only records the owner labels complete", ["a.5.35", "a.5.33"]),
            stage("selection", "The reconciled population has 240 monthly reviews across systems with different risk levels.", "Choose a representative selection method", "Stratify by risk and period, select reproducibly, and retain the population and selection rationale", "Use a reproducible random sample plus a targeted high-risk item and disclose both methods", "Choose the easiest records to retrieve", "Allow the owner to replace missing selections", ["a.5.35", "a.5.33"]),
            stage("exception", "Two sampled reviews lack approval evidence; the owner says both approvers remember completing them.", "Decide whether evidence is sufficient", "Record exceptions, expand testing based on risk, and avoid treating recollection as approval evidence", "Seek corroborating system records while recording the current exceptions and limiting the conclusion", "Accept verbal confirmation as equivalent evidence", "Drop the two items and select replacements", ["a.5.33", "a.5.35"]),
        ],
    },
    {
        "id": "supplier-due-diligence",
        "scenario_slug": "supplier_due_diligence",
        "title": "Supplier due diligence",
        "summary": "Evaluate a critical supplier using scoped evidence, risk ownership, and contract-ready conditions.",
        "category": "supplier-risk",
        "frameworks": ["iso27001", "dora"],
        "tags": ["supplier", "due-diligence", "contracting"],
        "difficulty": "practitioner",
        "estimated_minutes": 17,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": ["Scope diligence to the service and data flow", "Validate assurance boundaries and exceptions", "Translate residual risk into contract and monitoring conditions"],
        "persona": "Procurement Director",
        "stages": [
            stage("scope", "A payroll provider sent a generic security questionnaire. Procurement wants approval before the data-flow workshop.", "Scope diligence to the actual service", "Map data, access, subcontractors, criticality, and jurisdictions before deciding evidence needs", "Permit commercial discussion while blocking data transfer until service scope and evidence needs are confirmed", "Approve based on the completed generic questionnaire", "Use the provider's marketing security page as scope evidence", ["a.5.19", "a.5.21"]),
            stage("assurance", "The supplier provides a clean assurance report, but its scope excludes the subcontractor hosting backups.", "Evaluate assurance boundaries", "Record the exclusion, obtain relevant subcontractor assurance or compensating evidence, and reassess residual risk", "Accept the report provisionally with a time-bound condition for backup-host evidence", "Treat the clean opinion as covering every subcontractor", "Ignore backup hosting because it is indirect", ["a.5.19", "a.5.22"]),
            stage("conditions", "Launch is urgent and one medium residual risk remains around deletion verification.", "Convert residual risk into governed conditions", "Assign an authorized risk owner, add deletion evidence and audit rights to the contract, and set monitoring dates", "Approve a limited pilot with no production personal data until deletion evidence is verified", "Accept the risk in procurement meeting notes", "Launch fully and negotiate controls at renewal", ["a.5.20", "a.5.22"]),
        ],
    },
    {
        "id": "access-review-exception-handling",
        "scenario_slug": "access_review_exception_handling",
        "title": "Access-review exception handling",
        "summary": "Investigate, contain, and close access-review exceptions without erasing the audit trail.",
        "category": "access-control",
        "frameworks": ["iso27001", "soc2"],
        "tags": ["access-review", "exception", "least-privilege"],
        "difficulty": "practitioner",
        "estimated_minutes": 15,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": ["Triage exceptions by privilege and exposure", "Preserve reviewer decisions and ownership", "Verify revocation and systemic follow-up"],
        "persona": "Application Owner",
        "stages": [
            stage("triage", "A quarterly review finds a departed contractor still in a privileged group. The account is disabled but its API token remains valid.", "Triage the exception and immediate exposure", "Revoke the token, preserve logs, identify last use, and open an incident assessment", "Suspend the token and preserve logs while incident severity is confirmed immediately", "Mark the item resolved because the user account is disabled", "Wait for the former manager to confirm whether the token was used", ["a.5.18", "a.8.15"]),
            stage("ownership", "The application owner says Identity should own the exception; Identity says the application owns token lifecycle.", "Assign accountable remediation ownership", "Name one accountable owner, document contributing responsibilities, and escalate the control-design gap", "Assign joint actions but set a single escalation owner and closure date", "Leave ownership shared without a decision maker", "Close the exception as a communication issue", ["a.5.2", "a.5.18"]),
            stage("closure", "The token is revoked. The owner proposes closing with a screenshot showing it disabled.", "Require sufficient closure evidence", "Retain revocation logs, test for similar orphan tokens, update lifecycle controls, and verify effectiveness", "Close the immediate exposure but keep corrective action open pending the extent check", "Close solely from the current screenshot", "Delete the original exception after attaching the screenshot", ["a.5.18", "clause.10.2"]),
        ],
    },
    {
        "id": "dora-ict-incident-classification-reporting",
        "scenario_slug": "dora_ict_incident_classification_reporting",
        "title": "DORA ICT incident classification and reporting",
        "summary": "Classify an ICT incident using current facts, preserve reporting evidence, and manage staged notifications.",
        "category": "regulatory-incident",
        "frameworks": ["dora", "iso27001"],
        "tags": ["dora", "ict-incident", "regulatory-reporting"],
        "difficulty": "expert",
        "estimated_minutes": 20,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": ["Apply materiality criteria with documented assumptions", "Preserve classification and clock evidence", "Manage initial, intermediate, and final reporting as facts evolve"],
        "persona": "Regulatory Incident Lead",
        "stages": [
            stage("criteria", "A payment outage affects three Member States and a critical outsourced service, but loss estimates are incomplete.", "Apply incident classification criteria", "Assess every available materiality criterion, document unknowns, and provisionally classify with a rapid reassessment point", "Escalate as potentially major while completing the quantitative criteria within a fixed short window", "Delay classification until every loss figure is final", "Classify minor because direct losses are not yet known", ["a.5.24", "a.5.25"]),
            stage("initial_report", "The incident is major. Operations wants to wait for root cause before notifying because the first report will contain unknown fields.", "Protect the initial reporting obligation", "Submit the timely initial report with verified facts, explicit unknowns, and owned follow-up actions", "Prepare and approve the initial report now while legal confirms the exact channel and deadline", "Wait for root cause so the report is complete", "Estimate unknown facts without labeling assumptions", ["a.5.26", "a.5.28"]),
            stage("report_lifecycle", "Containment changes the affected-service count and a supplier timeline conflicts with internal logs.", "Manage intermediate and final reporting", "Reconcile sources, preserve both records, update the authority with material changes, and reserve final conclusions for verified root cause", "Issue an intermediate update using the internal timeline while flagging the supplier discrepancy and investigation", "Quietly overwrite the earlier timeline", "Send a final report immediately to stop further updates", ["a.5.27", "a.5.28"]),
        ],
    },
    {
        "id": "ai-control-applicability-escalation",
        "scenario_slug": "ai_control_applicability_escalation",
        "title": "AI control applicability and escalation",
        "summary": "Determine AI control applicability from system context and escalate uncertain or high-impact use.",
        "category": "ai-governance",
        "frameworks": ["iso42001", "iso27001"],
        "tags": ["ai", "applicability", "human-oversight"],
        "difficulty": "expert",
        "estimated_minutes": 19,
        "target_dimensions": ["control_mapping", "evidence", "escalation", "remediation"],
        "learning_objectives": ["Classify AI use from intended purpose and impact", "Avoid vendor claims as substitutes for evidence", "Escalate low-confidence and consequential applicability decisions"],
        "persona": "AI Product Owner",
        "stages": [
            stage("use_classification", "A vendor assistant ranks employee misconduct cases for investigators. The product owner calls it a harmless summarization tool.", "Classify the AI use from actual function and impact", "Document intended use, affected people, decision influence, data, and human authority before assigning risk", "Treat it as potentially high impact and pause automated ranking while the full use assessment is completed", "Accept the vendor's summarization label", "Classify only from the underlying model name", ["a.5.7", "a.5.8"]),
            stage("control_applicability", "The vendor says bias testing is not applicable because investigators make the final decision.", "Determine whether human review removes applicability", "Keep impact and bias controls applicable because ranking shapes attention, then test oversight effectiveness", "Mark the control provisionally applicable and gather evidence on how often investigators override rankings", "Exclude the control because a human clicks the final button", "Adopt the vendor's applicability statement without internal review", ["a.5.8", "a.5.35"]),
            stage("confidence_escalation", "Evidence of override behavior is incomplete and the launch decision is due today. Your applicability confidence is 0.62.", "Escalate a consequential low-confidence decision", "Route to human governance review, state the uncertainty, and limit deployment until evidence supports the decision", "Approve a tightly bounded non-production trial with mandatory review and evidence collection", "Approve production and revisit after complaints", "Mark confidence as 0.80 to avoid escalation", ["a.5.2", "a.5.35"]),
        ],
    },
]


def _enrich(practice: dict[str, Any]) -> dict[str, Any]:
    item = dict(practice)
    item.setdefault("jurisdiction", "international")
    item.setdefault("purpose_tags", ["learning", "competency"])
    item["status"] = "available"
    item["review_state"] = "reviewed"
    item["reviewed_by"] = REVIEWER
    item["reviewed_at"] = REVIEWED_AT
    item["source_path"] = f"skills/reviewed/{item['id']}/SKILL.md"
    item["author"] = "Astra Labs curriculum adaptation"
    item.setdefault("content_hash", _sha({"id": item["id"], "objectives": item["learning_objectives"]}))
    return item


PRACTICES = [_enrich(item) for item in [*EXISTING, *NEW]]


def write_catalog() -> None:
    catalog_entries = [
        {key: value for key, value in item.items() if key not in {"persona", "stages"}}
        for item in PRACTICES
    ]
    document = {
        "catalog_version": "2.0.0",
        "source_repository": SOURCE_REPOSITORY,
        "source_release": SOURCE_RELEASE,
        "source_commit": SOURCE_COMMIT,
        "license": "MIT",
        "practices": catalog_entries,
    }
    path = ROOT / "content" / "practices" / "index.json"
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n")


def _scenario_document(item: dict[str, Any]) -> dict[str, Any]:
    stages: list[dict[str, Any]] = []
    stage_specs = item["stages"]
    for index, spec in enumerate(stage_specs, start=1):
        next_stage = stage_specs[index]["slug"] if index < len(stage_specs) else "complete"
        refs = spec["control_refs"]
        choices = []
        variants = [
            ("correct", True, {"control_mapping": 12, "evidence": 12, "escalation": 10, "remediation": 10}, "controlled"),
            ("qualified", False, {"control_mapping": 6, "evidence": 5, "escalation": 6, "remediation": -2}, "qualified_alternative"),
            ("failure", False, {"control_mapping": -12, "evidence": -10, "escalation": -12, "remediation": -10}, "control_failure"),
            ("defer", False, {"control_mapping": -8, "evidence": -8, "escalation": -15, "remediation": -8}, "unmanaged_delay"),
        ]
        for order, (kind, correct, weights, outcome) in enumerate(variants, start=1):
            rationale = {
                "correct": f"This is the supported response: it preserves accountable evidence and applies {', '.join(refs)} proportionately.",
                "qualified": f"This is a qualified alternative, not the reference answer: it limits immediate exposure but leaves a named evidence or governance condition unresolved under {', '.join(refs)}.",
                "failure": f"This fails the control objective because it substitutes an unsupported conclusion for evidence required by {', '.join(refs)}.",
                "defer": f"Deferral leaves the risk unmanaged and misses the required escalation or remediation under {', '.join(refs)}.",
            }[kind]
            consequence = {
                "correct": "The decision remains evidenced, bounded, and owned.",
                "qualified": "Immediate exposure is limited, but a time-bound condition remains open.",
                "failure": "The control conclusion is unsupported and risk increases.",
                "defer": "The decision clock continues without accountable action.",
            }[kind]
            choices.append(
                {
                    "id": f"{spec['slug']}_{kind}",
                    "label": spec["choices"][kind],
                    "consequence": consequence,
                    "is_correct": correct,
                    "rationale": rationale,
                    "next_stage": next_stage,
                    "risk_outcome": outcome,
                    "dimension_weights": weights,
                    "control_refs": refs,
                    "display_order": order,
                }
            )
        stages.append(
            {
                "id": spec["slug"],
                "sequence": index,
                "agent_message": spec["prompt"],
                "demands": spec["demands"],
                "terminal": False,
                "choices": choices,
            }
        )
    stages.append(
        {
            "id": "complete",
            "sequence": len(stages) + 1,
            "agent_message": "",
            "demands": [],
            "terminal": True,
            "choices": [],
        }
    )
    content = {
        "slug": item["scenario_slug"],
        "title": item["title"],
        "brief": item["summary"],
        "track": "launch-curriculum",
        "frameworks": item["frameworks"],
        "difficulty": item["difficulty"],
        "entry_stage_id": stages[0]["id"],
        "persona": {"role": item["persona"], "stance": "professionally challenging"},
        "stages": stages,
    }
    content["content_hash"] = _sha(content)
    return content


SCENARIOS = [_scenario_document(item) for item in NEW]


def write_scenarios_and_fixtures() -> None:
    launch = {
        "schema_version": 1,
        "reviewed_by": REVIEWER,
        "reviewed_at": REVIEWED_AT,
        "license": "MIT",
        "scenarios": SCENARIOS,
    }
    (ROOT / "content" / "practices" / "launch_scenarios.json").write_text(
        json.dumps(launch, indent=2, ensure_ascii=False) + "\n"
    )
    fixtures = {
        "fixture_version": "v1",
        "paths": [
            {
                "scenario_slug": scenario["slug"],
                "correct": [stage["choices"][0]["id"] for stage in scenario["stages"] if not stage["terminal"]],
                "qualified_alternative": [stage["choices"][1]["id"] for stage in scenario["stages"] if not stage["terminal"]],
                "failure": [stage["choices"][2]["id"] for stage in scenario["stages"] if not stage["terminal"]],
            }
            for scenario in SCENARIOS
        ],
    }
    (ROOT / "content" / "practices" / "evaluation_fixtures.json").write_text(
        json.dumps(fixtures, indent=2) + "\n"
    )


def _sql_literal(value: Any) -> str:
    return "$curriculum$" + json.dumps(value, ensure_ascii=False) + "$curriculum$"


def write_migration() -> None:
    practices = []
    for item in PRACTICES:
        practices.append(
            {
                "id": item["id"],
                "scenario_slug": item["scenario_slug"],
                "title": item["title"],
                "summary": item["summary"],
                "category": item["category"],
                "frameworks": item["frameworks"],
                "difficulty": item["difficulty"],
                "estimated_minutes": item["estimated_minutes"],
                "learning_objectives": item["learning_objectives"],
                "persona": item["persona"],
                "source_hash": item["content_hash"],
            }
        )
    sql = f"""-- CORTEX 042 — Reviewed launch curriculum (15 published practices).
-- Idempotent, append-only for published curriculum, and deliberately does not
-- read upstream SKILL Markdown. Source fields below are inert reviewed metadata.

BEGIN;

ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS persona JSONB NOT NULL DEFAULT '{{}}'::jsonb;

CREATE TEMP TABLE launch_practice_seed (data JSONB) ON COMMIT DROP;
INSERT INTO launch_practice_seed VALUES ({_sql_literal(practices)}::jsonb);
CREATE TEMP TABLE launch_scenario_seed (data JSONB) ON COMMIT DROP;
INSERT INTO launch_scenario_seed VALUES ({_sql_literal(SCENARIOS)}::jsonb);

-- Attach governed metadata to the six existing scenarios without rewriting
-- their immutable version-1 snapshots.
UPDATE scenarios s
SET source_skill_id = p->>'id',
    source_skill_version = '2026.10.25',
    source_skill_url = 'urn:astra:curriculum:' || (p->>'id') || ':2026.10.25',
    source_skill_hash = p->>'source_hash',
    source_skill_license = 'MIT',
    source_review_state = 'reviewed',
    practice_area = p->>'category',
    estimated_minutes = (p->>'estimated_minutes')::INT,
    learning_objectives = p->'learning_objectives',
    persona = jsonb_build_object('role', p->>'persona', 'stance', 'professionally challenging')
FROM launch_practice_seed seed
CROSS JOIN LATERAL jsonb_array_elements(seed.data) p
WHERE s.slug = p->>'scenario_slug';

-- Legacy projection keeps every current loader and API path runnable.
INSERT INTO scenarios (
  slug, title, brief, track, frameworks, difficulty, active,
  source_skill_id, source_skill_version, source_skill_url, source_skill_hash,
  source_skill_license, source_review_state, practice_area, estimated_minutes,
  learning_objectives, persona
)
SELECT sc->>'slug', sc->>'title', sc->>'brief', sc->>'track',
       ARRAY(SELECT jsonb_array_elements_text(sc->'frameworks')),
       sc->>'difficulty', TRUE, p->>'id', '2026.10.25',
       'urn:astra:curriculum:' || (p->>'id') || ':2026.10.25',
       p->>'source_hash', 'MIT', 'reviewed', p->>'category',
       (p->>'estimated_minutes')::INT, p->'learning_objectives', sc->'persona'
FROM launch_scenario_seed ss
CROSS JOIN LATERAL jsonb_array_elements(ss.data) sc
JOIN launch_practice_seed ps ON TRUE
CROSS JOIN LATERAL jsonb_array_elements(ps.data) p
WHERE p->>'scenario_slug' = sc->>'slug'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scenario_stages (scenario_id, slug, sequence, agent_message, demands)
SELECT s.id, st->>'id', (st->>'sequence')::INT, st->>'agent_message',
       ARRAY(SELECT jsonb_array_elements_text(st->'demands'))
FROM launch_scenario_seed seed
CROSS JOIN LATERAL jsonb_array_elements(seed.data) sc
CROSS JOIN LATERAL jsonb_array_elements(sc->'stages') st
JOIN scenarios s ON s.slug = sc->>'slug'
ON CONFLICT (scenario_id, slug) DO NOTHING;

INSERT INTO scenario_choices (
  stage_id, choice_id, label, consequence, is_correct, framework_rationale,
  display_order, next_stage, risk_outcome, dimension_weights, control_refs
)
SELECT st.id, c->>'id', c->>'label', c->>'consequence',
       (c->>'is_correct')::BOOLEAN, c->>'rationale',
       (c->>'display_order')::INT, c->>'next_stage', c->>'risk_outcome',
       c->'dimension_weights', c->'control_refs'
FROM launch_scenario_seed seed
CROSS JOIN LATERAL jsonb_array_elements(seed.data) sc
CROSS JOIN LATERAL jsonb_array_elements(sc->'stages') stage_data
CROSS JOIN LATERAL jsonb_array_elements(stage_data->'choices') c
JOIN scenarios s ON s.slug = sc->>'slug'
JOIN scenario_stages st ON st.scenario_id = s.id AND st.slug = stage_data->>'id'
ON CONFLICT (stage_id, choice_id) DO NOTHING;

INSERT INTO practices (id)
SELECT p->>'id'
FROM launch_practice_seed seed
CROSS JOIN LATERAL jsonb_array_elements(seed.data) p
ON CONFLICT DO NOTHING;

INSERT INTO practice_versions (
  practice_id, version, status, title, summary, content, provenance,
  content_hash, published_at
)
SELECT p->>'id', '2026.10.25', 'published', p->>'title', p->>'summary',
       jsonb_build_object(
         'practice_area', p->>'category',
         'estimated_minutes', (p->>'estimated_minutes')::INT,
         'learning_objectives', p->'learning_objectives',
         'persona', jsonb_build_object('role', p->>'persona'),
         'availability', 'available',
         'claim', 'practice_completion_only'
       ),
       jsonb_build_object(
         'source_uri', 'urn:astra:curriculum:' || (p->>'id') || ':2026.10.25',
         'source_url', 'urn:astra:curriculum:' || (p->>'id') || ':2026.10.25',
         'source_hash', p->>'source_hash',
         'license', 'MIT',
         'review_state', 'reviewed',
         'reviewed_by', '{REVIEWER}',
         'reviewed_at', '{REVIEWED_AT}',
         'raw_skill_markdown_loaded', FALSE
       ),
       encode(digest(jsonb_build_object(
         'id', p->>'id', 'title', p->>'title', 'summary', p->>'summary',
         'objectives', p->'learning_objectives', 'persona', p->>'persona'
       )::text, 'sha256'), 'hex'),
       '{REVIEWED_AT}'::timestamptz
FROM launch_practice_seed seed
CROSS JOIN LATERAL jsonb_array_elements(seed.data) p
ON CONFLICT (practice_id, version) DO NOTHING;

-- Existing scenarios receive immutable v2 snapshots linked to the reviewed
-- practice. New scenarios begin at v1.
INSERT INTO scenario_versions (
  scenario_id, version, practice_version_id, status, slug, title, brief, track,
  frameworks, difficulty, entry_stage_id, answer_policy, content_hash,
  provenance, published_at
)
SELECT s.id,
       CASE WHEN sc IS NULL THEN 2 ELSE 1 END,
       pv.id, 'draft', s.slug, s.title, s.brief, s.track, s.frameworks,
       s.difficulty,
       (SELECT st.slug FROM scenario_stages st WHERE st.scenario_id = s.id ORDER BY st.sequence LIMIT 1),
       'exactly_one',
       encode(digest(jsonb_build_object(
         'slug', s.slug, 'version', CASE WHEN sc IS NULL THEN 2 ELSE 1 END,
         'practice', p->>'id', 'reviewed_at', '{REVIEWED_AT}'
       )::text, 'sha256'), 'hex'),
       jsonb_build_object(
         'source_uri', 'urn:astra:curriculum:' || (p->>'id') || ':2026.10.25',
         'license', 'MIT', 'reviewed_by', '{REVIEWER}',
         'reviewed_at', '{REVIEWED_AT}', 'deterministic', TRUE
       ),
       NULL
FROM launch_practice_seed ps
CROSS JOIN LATERAL jsonb_array_elements(ps.data) p
JOIN scenarios s ON s.slug = p->>'scenario_slug'
JOIN practice_versions pv ON pv.practice_id = p->>'id' AND pv.version = '2026.10.25'
LEFT JOIN LATERAL (
  SELECT candidate
  FROM launch_scenario_seed ss
  CROSS JOIN LATERAL jsonb_array_elements(ss.data) candidate
  WHERE candidate->>'slug' = s.slug
  LIMIT 1
) found(sc) ON TRUE
ON CONFLICT (scenario_id, version) DO NOTHING;

INSERT INTO scenario_stage_versions (
  scenario_version_id, stable_id, sequence, agent_message, demands, terminal
)
SELECT sv.id, st.slug, st.sequence, st.agent_message,
       to_jsonb(COALESCE(st.demands, ARRAY[]::TEXT[])), st.slug = 'complete'
FROM scenario_versions sv
JOIN scenarios s ON s.id = sv.scenario_id
JOIN scenario_stages st ON st.scenario_id = s.id
JOIN practice_versions pv ON pv.id = sv.practice_version_id AND pv.version = '2026.10.25'
WHERE sv.status = 'draft'
  AND NOT EXISTS (
    SELECT 1 FROM scenario_stage_versions existing
    WHERE existing.scenario_version_id = sv.id AND existing.stable_id = st.slug
  );

INSERT INTO scenario_choice_versions (
  stage_version_id, stable_id, label, consequence, is_correct,
  framework_rationale, next_stage_id, risk_outcome, dimension_weights,
  control_refs, display_order
)
SELECT stv.id, c.choice_id, c.label, c.consequence, c.is_correct,
       c.framework_rationale, c.next_stage, c.risk_outcome,
       c.dimension_weights, c.control_refs, c.display_order
FROM scenario_versions sv
JOIN practice_versions pv ON pv.id = sv.practice_version_id AND pv.version = '2026.10.25'
JOIN scenario_stage_versions stv ON stv.scenario_version_id = sv.id
JOIN scenario_stages st ON st.scenario_id = sv.scenario_id AND st.slug = stv.stable_id
JOIN scenario_choices c ON c.stage_id = st.id
WHERE sv.status = 'draft'
  AND NOT EXISTS (
    SELECT 1 FROM scenario_choice_versions existing
    WHERE existing.stage_version_id = stv.id AND existing.stable_id = c.choice_id
  );

UPDATE scenario_versions
SET status = 'published', published_at = '{REVIEWED_AT}'::timestamptz
WHERE status = 'draft'
  AND practice_version_id IN (
    SELECT id FROM practice_versions WHERE version = '2026.10.25'
  );

INSERT INTO learning_tracks (id) VALUES ('launch-curriculum') ON CONFLICT DO NOTHING;
INSERT INTO track_versions (
  track_id, version, status, title, content_hash, published_at
)
VALUES (
  'launch-curriculum', 1, 'draft', 'Reviewed launch curriculum',
  encode(digest('launch-curriculum:1:2026-10-25', 'sha256'), 'hex'), NULL
)
ON CONFLICT (track_id, version) DO NOTHING;

INSERT INTO track_memberships (track_version_id, scenario_version_id, position, required)
SELECT tv.id, ranked.id, ranked.position, TRUE
FROM track_versions tv
JOIN (
  SELECT sv.id, row_number() OVER (ORDER BY s.slug)::INT AS position
  FROM scenario_versions sv
  JOIN scenarios s ON s.id = sv.scenario_id
  JOIN practice_versions pv ON pv.id = sv.practice_version_id
  WHERE sv.status = 'published' AND pv.version = '2026.10.25'
) ranked ON TRUE
WHERE tv.track_id = 'launch-curriculum' AND tv.version = 1 AND tv.status = 'draft'
  AND NOT EXISTS (
    SELECT 1 FROM track_memberships tm
    WHERE tm.track_version_id = tv.id AND tm.scenario_version_id = ranked.id
  );

UPDATE track_versions
SET status = 'published', published_at = '{REVIEWED_AT}'::timestamptz
WHERE track_id = 'launch-curriculum' AND version = 1 AND status = 'draft';

INSERT INTO curriculum_reviews (
  subject_type, subject_id, reviewer_id, decision, rationale, created_at
)
SELECT subject_type, subject_id, '{REVIEWER}', 'approved',
       'Reviewed for deterministic learning use; completion is not a certification claim.',
       '{REVIEWED_AT}'::timestamptz
FROM (
  SELECT 'practice_version'::TEXT AS subject_type, id AS subject_id
  FROM practice_versions WHERE version = '2026.10.25'
  UNION ALL
  SELECT 'scenario_version', sv.id
  FROM scenario_versions sv
  JOIN practice_versions pv ON pv.id = sv.practice_version_id
  WHERE pv.version = '2026.10.25'
  UNION ALL
  SELECT 'track_version', id
  FROM track_versions WHERE track_id = 'launch-curriculum' AND version = 1
) subjects
WHERE NOT EXISTS (
  SELECT 1 FROM curriculum_reviews r
  WHERE r.subject_type = subjects.subject_type
    AND r.subject_id = subjects.subject_id
    AND r.reviewer_id = '{REVIEWER}'
    AND r.decision = 'approved'
);

INSERT INTO curriculum_validation_runs (
  subject_type, subject_id, validator_version, valid, findings, content_hash, created_at
)
SELECT subject_type, subject_id, 'launch-curriculum-validator/1.0.0', TRUE,
       '[]'::jsonb, content_hash, '{REVIEWED_AT}'::timestamptz
FROM (
  SELECT 'practice_version'::TEXT AS subject_type, id AS subject_id, content_hash
  FROM practice_versions WHERE version = '2026.10.25'
  UNION ALL
  SELECT 'scenario_version', sv.id, sv.content_hash
  FROM scenario_versions sv
  JOIN practice_versions pv ON pv.id = sv.practice_version_id
  WHERE pv.version = '2026.10.25'
  UNION ALL
  SELECT 'track_version', id, content_hash
  FROM track_versions WHERE track_id = 'launch-curriculum' AND version = 1
) subjects
WHERE NOT EXISTS (
  SELECT 1 FROM curriculum_validation_runs vr
  WHERE vr.subject_type = subjects.subject_type
    AND vr.subject_id = subjects.subject_id
    AND vr.validator_version = 'launch-curriculum-validator/1.0.0'
    AND vr.valid
    AND vr.content_hash = subjects.content_hash
);

COMMIT;
"""
    (ROOT / "migrations" / "042_reviewed_launch_curriculum.sql").write_text(sql)


def main() -> None:
    write_catalog()
    write_scenarios_and_fixtures()
    write_migration()


if __name__ == "__main__":
    main()
