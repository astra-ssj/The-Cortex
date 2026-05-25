# api/findings.py — Remediation tracker findings. Mounted at /api/v1/findings so the route
# is always available (root API), independent of compliance-engine v1 loading.

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query

from api.schemas import FindingPatchBody, PaginatedRemediationFindings
from core.rbac import Permission, require_permission
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, resolve_scoped_org_id

from core.audit_fabric import audit_fabric

logger = structlog.get_logger()

router = APIRouter(tags=["findings"])

# In-memory store for remediation findings (same seed as compliance-engine).
FINDINGS_STORE: list[dict[str, Any]] = [
    {"org_id": "demo-org-001", "id": "finding-001", "title": "72-hour breach notification procedure not tested", "severity": "CRITICAL", "framework": "GDPR 2016/679", "framework_id": "gdpr-2016-679", "control_id": "GDPR-BN-02", "control_name": "Breach notification procedure", "reference": "GDPR Art.33(1)", "entity": "AstraLabs DE", "entity_code": "DE", "status": "OPEN", "current_state": "Procedure documented but never exercised", "required_state": "Tested with demonstrated 72h capability", "actions": ["Conduct tabletop breach exercise", "Test supervisory authority notification", "Assign breach notification owner", "Document evidence of test"], "completed_actions": [], "owner": "CISO", "due_date": "2026-03-15", "days_open": 45, "priority": "P0", "notes": []},
    {"org_id": "demo-org-001", "id": "finding-002", "title": "NIS2 24-hour CSIRT notification process undefined", "severity": "CRITICAL", "framework": "NIS2 Directive", "framework_id": "nis2-2022-2555", "control_id": "NIS2-IR-01", "control_name": "Incident reporting", "reference": "NIS2 Art.23(4)(a)", "entity": "AstraLabs DE", "entity_code": "DE", "status": "IN_PROGRESS", "current_state": "General IRP exists, missing NIS2 steps", "required_state": "Documented 24h CSIRT notification process", "actions": ["Identify national competent authority per jurisdiction", "Add NIS2 steps to IRP", "Test in next incident drill"], "completed_actions": [0], "owner": "Security Lead DE", "due_date": "2026-03-01", "days_open": 45, "priority": "P0", "notes": []},
    {"org_id": "demo-org-001", "id": "finding-003", "title": "Human oversight for AI decisions absent", "severity": "CRITICAL", "framework": "EU AI Act 2024", "framework_id": "eu-ai-act-2024", "control_id": "EUAI-HO-01", "control_name": "Human oversight", "reference": "EU AI Act Art.14", "entity": "AstraLabs DE", "entity_code": "DE", "status": "OPEN", "current_state": "No human review workflow for AI decisions", "required_state": "Human-in-the-loop for significant automated decisions", "actions": ["Implement Dynamic Autonomy Router", "Build human review queue", "Define review SLA", "Train reviewers"], "completed_actions": [], "owner": "Unassigned", "due_date": "2026-04-01", "days_open": 45, "priority": "P0", "notes": []},
    {"org_id": "demo-org-001", "id": "finding-004", "title": "US transfer SCCs post-Schrems II review overdue", "severity": "HIGH", "framework": "GDPR 2016/679", "framework_id": "gdpr-2016-679", "control_id": "GDPR-IT-01", "control_name": "International transfers", "reference": "GDPR Art.46", "entity": "AstraLabs DE", "entity_code": "DE", "status": "IN_PROGRESS", "current_state": "Pre-2021 SCCs still in use with US processors", "required_state": "2021 EU SCCs + Transfer Impact Assessments", "actions": ["Audit US processor contracts", "Execute updated SCCs", "Complete Transfer Impact Assessments"], "completed_actions": [0], "owner": "DPO", "due_date": "2026-02-28", "days_open": 60, "priority": "P1", "notes": []},
    {"org_id": "demo-org-001", "id": "finding-005", "title": "Supply chain security assessment not performed", "severity": "HIGH", "framework": "NIS2 Directive", "framework_id": "nis2-2022-2555", "control_id": "NIS2-RM-04", "control_name": "Supply chain security", "reference": "NIS2 Art.21(2)(d)", "entity": "AstraLabs DE", "entity_code": "DE", "status": "OPEN", "current_state": "No formal assessment of ICT supplier security", "required_state": "Critical suppliers assessed with contractual obligations", "actions": ["Identify critical ICT suppliers", "Develop security questionnaire", "Add NIS2 requirements to contracts"], "completed_actions": [], "owner": "CISO", "due_date": "2026-04-30", "days_open": 30, "priority": "P1", "notes": []},
    {"org_id": "demo-org-001", "id": "finding-006", "title": "NIS2 entity registration not completed", "severity": "HIGH", "framework": "NIS2 Directive", "framework_id": "nis2-2022-2555", "control_id": "NIS2-SC-01", "control_name": "Registration", "reference": "NIS2 Art.27", "entity": "AstraLabs ES", "entity_code": "ES", "status": "OPEN", "current_state": "Not registered with Spanish competent authority", "required_state": "Registered with INCIBE-CERT by deadline", "actions": ["Complete INCIBE registration", "Appoint NIS2 contact point", "Notify competent authority"], "completed_actions": [], "owner": "Security Lead ES", "due_date": "2026-03-31", "days_open": 20, "priority": "P1", "notes": []},
    {"org_id": "demo-org-001", "id": "finding-007", "title": "DPO not appointed for UK entity", "severity": "HIGH", "framework": "GDPR 2016/679", "framework_id": "gdpr-2016-679", "control_id": "GDPR-DPO-01", "control_name": "DPO appointment", "reference": "GDPR Art.37", "entity": "AstraLabs UK", "entity_code": "UK", "status": "IN_PROGRESS", "current_state": "No DPO appointed for UK entity post-Brexit", "required_state": "Qualified DPO appointed and notified to ICO", "actions": ["Assess DPO requirement for UK entity", "Appoint internal or external DPO", "Notify ICO of DPO appointment"], "completed_actions": [0], "owner": "DPO", "due_date": "2026-03-15", "days_open": 35, "priority": "P1", "notes": []},
    {"org_id": "demo-org-001", "id": "finding-008", "title": "Penetration test overdue — last performed 18 months ago", "severity": "HIGH", "framework": "ISO/IEC 27001:2022", "framework_id": "iso27001-2022", "control_id": "ISO-A.8.8", "control_name": "Management of technical vulnerabilities", "reference": "ISO 27001 A.8.8", "entity": "AstraLabs DE", "entity_code": "DE", "status": "OPEN", "current_state": "Last penetration test 18 months ago", "required_state": "Annual penetration test with remediation evidence", "actions": ["Procure penetration testing provider", "Scope annual penetration test", "Schedule test for Q1 2026", "Remediate critical findings within 30 days"], "completed_actions": [], "owner": "CTO", "due_date": "2026-03-31", "days_open": 25, "priority": "P1", "notes": []},
    {"org_id": "demo-org-001", "id": "finding-009", "title": "GDPR RoPA incomplete — missing 3 processing activities", "severity": "MEDIUM", "framework": "GDPR 2016/679", "framework_id": "gdpr-2016-679", "control_id": "GDPR-AG-01", "control_name": "Records of processing", "reference": "GDPR Art.30", "entity": "AstraLabs UK", "entity_code": "UK", "status": "IN_PROGRESS", "current_state": "RoPA exists but missing HR, Marketing, Analytics", "required_state": "Complete RoPA covering all processing activities", "actions": ["Interview HR and Marketing for processing activities", "Document all data flows", "Update RoPA and review annually"], "completed_actions": [0], "owner": "DPO", "due_date": "2026-02-28", "days_open": 40, "priority": "P2", "notes": []},
    {"org_id": "demo-org-001", "id": "finding-010", "title": "Cloud service security not formally assessed", "severity": "MEDIUM", "framework": "ISO/IEC 27001:2022", "framework_id": "iso27001-2022", "control_id": "ISO-A.5.23", "control_name": "Information security for cloud services", "reference": "ISO 27001 A.5.23", "entity": "AstraLabs AU", "entity_code": "AU", "status": "OPEN", "current_state": "No formal cloud security assessment performed", "required_state": "Cloud services assessed against security requirements", "actions": ["Inventory all cloud services used", "Assess against ISO 27001 A.5.23", "Implement cloud security controls"], "completed_actions": [], "owner": "Security Lead AU", "due_date": "2026-05-31", "days_open": 10, "priority": "P2", "notes": []},
    {"org_id": "demo-org-001", "id": "finding-011", "title": "Business continuity plan not tested", "severity": "MEDIUM", "framework": "NIS2 Directive", "framework_id": "nis2-2022-2555", "control_id": "NIS2-RM-03", "control_name": "BCP/DR", "reference": "NIS2 Art.21(2)(c)", "entity": "AstraLabs DE", "entity_code": "DE", "status": "REMEDIATED", "current_state": "BCP tested in Q4 2025 tabletop exercise", "required_state": "Annual BCP test with documented results", "actions": ["Conduct annual BCP tabletop", "Document test results", "Address gaps identified"], "completed_actions": [0, 1, 2], "owner": "CISO", "due_date": "2026-01-31", "days_open": 0, "priority": "P2", "notes": []},
    {"org_id": "demo-org-001", "id": "finding-012", "title": "Security awareness training completion below 90%", "severity": "LOW", "framework": "ISO/IEC 27001:2022", "framework_id": "iso27001-2022", "control_id": "ISO-A.6.3", "control_name": "Information security awareness", "reference": "ISO 27001 A.6.3", "entity": "AstraLabs TH", "entity_code": "TH", "status": "IN_PROGRESS", "current_state": "72% completion rate across TH entity", "required_state": "90%+ completion with evidence", "actions": ["Send reminder to incomplete staff", "Set completion deadline", "Report to entity head"], "completed_actions": [0], "owner": "Security Lead TH", "due_date": "2026-02-28", "days_open": 15, "priority": "P2", "notes": []},
]


def attach_evidence_to_finding(
    finding_id: str,
    *,
    evidence_id: str,
    title: str,
    document_id: str | None = None,
) -> bool:
    """Append a graph evidence reference to an in-memory remediation finding (idempotent)."""
    for f in FINDINGS_STORE:
        if f.get("id") != finding_id:
            continue
        items: list[dict[str, Any]] = list(f.get("evidence") or [])
        if any(str(e.get("id")) == evidence_id for e in items if isinstance(e, dict)):
            return True
        entry: dict[str, Any] = {
            "id": evidence_id,
            "title": title,
            "linked_at": datetime.now(timezone.utc).isoformat(),
        }
        if document_id:
            entry["document_id"] = document_id
        items.append(entry)
        f["evidence"] = items
        return True
    return False


@router.get("", summary="List all findings")
async def list_findings(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    framework_id: Optional[str] = None,
    entity: Optional[str] = None,
    org_id: Optional[str] = Query(None, description="Scoped organisation id (demo toggle)"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
) -> PaginatedRemediationFindings:
    """Return remediation findings. Filter by status, severity, framework_id, entity if provided."""
    scope = (org_id or current_user.get("org_id") or DEMO_ORG_ID).strip()
    effective = resolve_scoped_org_id(current_user, scope)
    result = [f for f in FINDINGS_STORE if f.get("org_id", DEMO_ORG_ID) == effective]
    if status is not None and status.strip():
        result = [f for f in result if f.get("status") == status.strip()]
    if severity is not None and severity.strip():
        result = [f for f in result if f.get("severity") == severity.strip()]
    if framework_id is not None and framework_id.strip():
        result = [f for f in result if f.get("framework_id") == framework_id.strip()]
    if entity is not None and entity.strip():
        result = [f for f in result if f.get("entity_code") == entity.strip()]
    total = len(result)
    page = result[offset : offset + limit]
    return PaginatedRemediationFindings(items=page, total=total, offset=offset, limit=limit)


@router.get("/{finding_id}", summary="Get finding by id")
async def get_finding(
    finding_id: str,
    org_id: Optional[str] = Query(None, description="Scoped organisation id (demo toggle)"),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Return a single remediation finding when it exists for the scoped organisation."""
    scope = (org_id or current_user.get("org_id") or DEMO_ORG_ID).strip()
    effective = resolve_scoped_org_id(current_user, scope)
    for f in FINDINGS_STORE:
        if f.get("id") == finding_id and f.get("org_id", DEMO_ORG_ID) == effective:
            return f
    raise HTTPException(status_code=404, detail="Finding not found")


@router.patch("/{finding_id}", summary="Update finding")
async def update_finding(
    finding_id: str,
    body: FindingPatchBody,
    org_id: Optional[str] = Query(None, description="Scoped organisation id (demo toggle)"),
    current_user: dict = Depends(require_permission(Permission.edit_findings)),
) -> dict[str, Any]:
    """Accept: status, owner, due_date, notes, completed_actions, priority. Log to audit fabric."""
    scope = (org_id or current_user.get("org_id") or DEMO_ORG_ID).strip()
    effective = resolve_scoped_org_id(current_user, scope)
    # Tenant isolation: only match findings belonging to the caller's scoped organisation.
    idx = next(
        (
            i
            for i, f in enumerate(FINDINGS_STORE)
            if f.get("id") == finding_id and f.get("org_id", DEMO_ORG_ID) == effective
        ),
        None,
    )
    if idx is None:
        raise HTTPException(status_code=404, detail="Finding not found")

    before = deepcopy(FINDINGS_STORE[idx])
    patch = body.model_dump(exclude_unset=True)

    if "status" in patch and patch["status"] is not None:
        FINDINGS_STORE[idx]["status"] = str(patch["status"]).strip()
    if "severity" in patch and patch["severity"] is not None:
        FINDINGS_STORE[idx]["severity"] = str(patch["severity"]).strip()
    if "owner" in patch and patch["owner"] is not None:
        FINDINGS_STORE[idx]["owner"] = str(patch["owner"]).strip()
    if "due_date" in patch and patch["due_date"] is not None:
        FINDINGS_STORE[idx]["due_date"] = str(patch["due_date"]).strip()
    if "priority" in patch and patch["priority"] is not None:
        FINDINGS_STORE[idx]["priority"] = str(patch["priority"]).strip()
    if "notes" in patch and isinstance(patch["notes"], list):
        FINDINGS_STORE[idx]["notes"] = list(patch["notes"])
    elif patch.get("note_append"):
        FINDINGS_STORE[idx].setdefault("notes", []).append(
            {"text": str(patch["note_append"]), "timestamp": patch.get("note_timestamp") or ""}
        )
    if "completed_actions" in patch and isinstance(patch["completed_actions"], list):
        action_count = len(FINDINGS_STORE[idx].get("actions") or [])
        FINDINGS_STORE[idx]["completed_actions"] = sorted(
            {int(x) for x in patch["completed_actions"] if 0 <= int(x) < action_count}
        )

    updated = FINDINGS_STORE[idx]
    audit_fabric.log(
        "finding_updated",
        entity_type="finding",
        entity_id=finding_id,
        payload={"before": {k: before.get(k) for k in ("status", "owner", "due_date")}, "after": {k: updated.get(k) for k in ("status", "owner", "due_date")}},
    )
    logger.info("finding_updated", finding_id=finding_id, status=updated.get("status"))
    return updated
