# ontology_mapper.py — Map chunks to ontology via LLM (CircuitBreaker). Log to audit_fabric. Route to human review if confidence < 0.75.

from __future__ import annotations

from typing import List, cast

import structlog

from core.audit_fabric import append_audit_log, audit_fabric
from core.circuit_breaker import CircuitBreaker, register_circuit_breaker
from core.human_review import enqueue_ingestion_human_review
from core.tenant import DEMO_ORG_ID
from db.session import async_session_factory
from ontology.models import (
    ControlRef,
    Obligation,
    OntologyMappingResult,
    Person,
    SystemAsset,
)

from .document_processor import DocumentChunk

logger = structlog.get_logger()

CONFIDENCE_THRESHOLD = 0.75

_ingestion_breaker = CircuitBreaker("ingestion_llm", failure_threshold=5)
register_circuit_breaker(_ingestion_breaker)


async def _call_llm_for_mapping(chunks: List[DocumentChunk], document_type: str) -> OntologyMappingResult:
    """
    Call LLM to extract controls, obligations, people, systems from chunks.
    Wrapped in CircuitBreaker by map_chunks_to_ontology. Replace with real LLM call.
    """
    controls = [ControlRef(framework_id="gdpr", control_id="lawful-basis-consent")]
    obligations = [
        Obligation(
            jurisdiction="EU",
            purpose_tags=["ingestion"],
            id="obl-1",
            description="Processing must have lawful basis",
            control_refs=controls,
        )
    ]
    people = [
        Person(
            jurisdiction="internal",
            purpose_tags=[],
            id="p1",
            name="Document Author",
            role="author",
        )
    ]
    systems = [
        SystemAsset(
            jurisdiction="internal",
            purpose_tags=[],
            id="sys1",
            name="Document System",
            system_type="application",
        )
    ]
    score = 0.82
    return OntologyMappingResult(
        controls=controls,
        obligations=obligations,
        people=people,
        systems=systems,
        confidence_score=score,
        requires_human_review=score < CONFIDENCE_THRESHOLD,
    )


async def map_chunks_to_ontology(
    chunks: List[DocumentChunk],
    document_type: str,
    document_id: str,
    org_id: str = DEMO_ORG_ID,
) -> OntologyMappingResult:
    """
    Take DocumentChunk list + document type; call LLM (CircuitBreaker); return OntologyMappingResult.
    Route to human review if confidence < 0.75. Log every extraction to audit_fabric.
    """
    audit_fabric.log(
        "ontology_mapping_start",
        entity_type="document",
        entity_id=document_id,
        payload={"chunk_count": len(chunks), "document_type": document_type},
    )
    try:
        result = await _ingestion_breaker.execute(_call_llm_for_mapping, chunks, document_type)
    except Exception as e:
        audit_fabric.log(
            "ontology_mapping_error",
            entity_type="document",
            entity_id=document_id,
            payload={"error": str(e)},
        )
        raise
    if result.confidence_score < CONFIDENCE_THRESHOLD:
        result.requires_human_review = True
        async with async_session_factory() as session:
            await enqueue_ingestion_human_review(
                session,
                org_id,
                document_id,
                float(result.confidence_score),
            )
            await append_audit_log(
                session,
                event_type="ontology_human_review_enqueued",
                entity_type="document",
                entity_id=document_id,
                payload={
                    "org_id": org_id,
                    "confidence": float(result.confidence_score),
                    "document_type": document_type,
                },
            )
            await session.commit()
    audit_fabric.log(
        "ontology_mapping_done",
        entity_type="document",
        entity_id=document_id,
        payload={
            "controls": len(result.controls),
            "obligations": len(result.obligations),
            "confidence_score": result.confidence_score,
            "requires_human_review": result.requires_human_review,
        },
    )
    return cast(OntologyMappingResult, result)
