# services/ingestion/evidence_creator.py — Create Evidence entities for successfully mapped controls.

from __future__ import annotations

import hashlib
from typing import List

import structlog

from core.audit_fabric import audit_fabric
from ontology.models import ControlRef, Evidence, OntologyMappingResult

logger = structlog.get_logger()


def content_hash(content: str) -> str:
    """SHA-256 of document content."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def create_evidence_from_mapping(
    mapping: OntologyMappingResult,
    document_content: str,
    document_id: str,
    evidence_type: str = "POLICY_DOCUMENT",
) -> List[Evidence]:
    """
    For each successfully mapped control → create Evidence entity.
    evidence_type = POLICY_DOCUMENT; content_hash; link obligations_satisfied.
    """
    digest = content_hash(document_content)
    evidence_list: List[Evidence] = []
    obligation_ids = [o.id for o in mapping.obligations if o.id]
    for i, ctrl in enumerate(mapping.controls):
        ev_id = f"ev-{document_id}-{i}"
        ev = Evidence(
            jurisdiction="internal",
            purpose_tags=["ingestion", "evidence"],
            id=ev_id,
            evidence_type=evidence_type,
            content_hash=digest,
            obligations_satisfied=obligation_ids,
            control_refs=[ctrl],
            confidence_score=mapping.confidence_score,
            requires_human_review=mapping.requires_human_review,
        )
        evidence_list.append(ev)
        audit_fabric.log("evidence_created", entity_type="evidence", entity_id=ev_id, payload={"content_hash": digest[:16], "obligations_count": len(obligation_ids)})
    if not mapping.controls and obligation_ids:
        ev_id = f"ev-{document_id}-0"
        ev = Evidence(
            jurisdiction="internal",
            purpose_tags=["ingestion", "evidence"],
            id=ev_id,
            evidence_type=evidence_type,
            content_hash=digest,
            obligations_satisfied=obligation_ids,
            control_refs=[],
            confidence_score=mapping.confidence_score,
            requires_human_review=mapping.requires_human_review,
        )
        evidence_list.append(ev)
        audit_fabric.log("evidence_created", entity_type="evidence", entity_id=ev_id, payload={"content_hash": digest[:16]})
    return evidence_list
