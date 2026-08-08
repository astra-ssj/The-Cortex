# aws_evidence.py — Create Evidence entities for passing AWS Config rules. AUTOMATED_SCAN, collector=AI_AGENT.

from __future__ import annotations

import hashlib
from typing import List

import structlog

from core.audit_fabric import audit_fabric
from ontology.models import ControlFinding, ControlRef, Evidence

logger = structlog.get_logger()


def _content_hash_from_config_compliance(score: float, recommendation_id: str) -> str:
    """Derive content_hash from compliance score and rule for idempotency."""
    raw = f"{recommendation_id}:{score}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_evidence_from_control_findings(
    control_findings: List[ControlFinding],
    security_score: float = 1.0,
) -> List[Evidence]:
    """
    For each passing AWS Config rule create an Evidence entity.
    evidence_type = AUTOMATED_SCAN, collector = AI_AGENT.
    Map obligations_satisfied (NIS2-RM-10, ISO A.8.x etc.) from control_ref.
    """
    evidence_list: List[Evidence] = []
    obligation_ids: List[str] = []
    compliant_refs: List[ControlRef] = []
    for cf in control_findings:
        if cf.status != "compliant":
            continue
        ref = cf.control_ref
        obligation_id = f"{ref.framework_id}-{ref.control_id}" if ref.framework_id else ref.control_id
        if obligation_id and obligation_id not in obligation_ids:
            obligation_ids.append(obligation_id)
        compliant_refs.append(ref)
    if not compliant_refs:
        return evidence_list
    content_hash = _content_hash_from_config_compliance(security_score, "aws-connector")
    ev_id = f"ev-aws-{content_hash[:12]}"
    ev = Evidence(
        jurisdiction="internal",
        purpose_tags=["aws", "connector", "evidence"],
        id=ev_id,
        evidence_type="AUTOMATED_SCAN",
        content_hash=content_hash,
        obligations_satisfied=obligation_ids or ["NIS2-RM-10"],
        control_refs=compliant_refs,
        confidence_score=security_score,
        requires_human_review=False,
        collector="AI_AGENT",
    )
    evidence_list.append(ev)
    audit_fabric.log(
        "aws_evidence_created",
        entity_type="evidence",
        entity_id=ev_id,
        payload={
            "obligations_count": len(obligation_ids),
            "security_score": security_score,
        },
    )
    return evidence_list
