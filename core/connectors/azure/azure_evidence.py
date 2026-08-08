# azure_evidence.py — Create Evidence entities for compliant Azure Policy/Defender controls. AUTOMATED_SCAN, collector=AI_AGENT.

from __future__ import annotations

import hashlib
from typing import List

import structlog

from core.audit_fabric import audit_fabric
from ontology.models import ControlFinding, Evidence

logger = structlog.get_logger()


def _content_hash_from_defender_score(score: float, recommendation_id: str) -> str:
    """Derive content_hash from Defender score and recommendation for idempotency."""
    raw = f"{recommendation_id}:{score}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_evidence_from_control_findings(
    control_findings: List[ControlFinding],
    defender_score: float = 1.0,
) -> List[Evidence]:
    """
    For each compliant Azure Policy / Defender control create an Evidence entity.
    evidence_type = AUTOMATED_SCAN, collector = AI_AGENT.
    Map obligations_satisfied (NIS2-RM-10, ISO A.8.x etc.) from control_ref.
    """
    evidence_list: List[Evidence] = []
    obligation_ids: List[str] = []
    for cf in control_findings:
        if cf.status != "compliant":
            continue
        ref = cf.control_ref
        obligation_id = f"{ref.framework_id}-{ref.control_id}" if ref.framework_id else ref.control_id
        obligation_ids.append(obligation_id)
    # One evidence per unique obligation or one aggregate
    content_hash = _content_hash_from_defender_score(defender_score, "azure-connector")
    ev_id = f"ev-azure-{content_hash[:12]}"
    ev = Evidence(
        jurisdiction="internal",
        purpose_tags=["azure", "connector", "evidence"],
        id=ev_id,
        evidence_type="AUTOMATED_SCAN",
        content_hash=content_hash,
        obligations_satisfied=obligation_ids,
        control_refs=[cf.control_ref for cf in control_findings if cf.status == "compliant"],
        confidence_score=defender_score,
        requires_human_review=False,
        collector="AI_AGENT",
    )
    evidence_list.append(ev)
    audit_fabric.log(
        "azure_evidence_created",
        entity_type="evidence",
        entity_id=ev_id,
        payload={
            "obligations_count": len(obligation_ids),
            "defender_score": defender_score,
        },
    )
    return evidence_list
