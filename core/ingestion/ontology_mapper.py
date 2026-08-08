# ontology_mapper.py — Map chunks to ontology via LLM (CircuitBreaker). Log to audit_fabric. Route to human review if confidence < 0.75.

from __future__ import annotations

from typing import List, cast

import structlog

from core.audit_fabric import append_audit_log, audit_fabric
from core.circuit_breaker import CircuitBreaker, register_circuit_breaker
from core.human_review import enqueue_ingestion_human_review
from core.llm import StructuredCompletionRequest, complete_structured
from core.llm.mapping_prompt import build_ontology_mapping_request
from core.llm.mapping_schema import OntologyMappingLLMOutput
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


def _llm_output_to_result(out: OntologyMappingLLMOutput) -> OntologyMappingResult:
    controls = [ControlRef(framework_id=c.framework_id, control_id=c.control_id) for c in out.controls]
    obligations = [
        Obligation(
            jurisdiction=o.jurisdiction,
            purpose_tags=list(o.purpose_tags),
            id=o.id,
            description=o.description,
            control_refs=[ControlRef(framework_id=r.framework_id, control_id=r.control_id) for r in o.control_refs],
        )
        for o in out.obligations
    ]
    people = [
        Person(
            jurisdiction=p.jurisdiction,
            purpose_tags=list(p.purpose_tags),
            id=p.id,
            name=p.name,
            role=p.role,
        )
        for p in out.people
    ]
    systems = [
        SystemAsset(
            jurisdiction=s.jurisdiction,
            purpose_tags=list(s.purpose_tags),
            id=s.id,
            name=s.name,
            system_type=s.system_type,
        )
        for s in out.systems
    ]
    score = float(out.confidence_score)
    return OntologyMappingResult(
        controls=controls,
        obligations=obligations,
        people=people,
        systems=systems,
        confidence_score=score,
        requires_human_review=score < CONFIDENCE_THRESHOLD,
    )


async def _call_llm_for_mapping(chunks: List[DocumentChunk], document_type: str) -> OntologyMappingResult:
    """
    Multi-provider LLM extraction (Anthropic → OpenAI → stub per CORTEX_LLM_PROVIDERS).
    Wrapped in CircuitBreaker by map_chunks_to_ontology.
    """
    system, user = build_ontology_mapping_request([c.content for c in chunks], document_type)
    request = StructuredCompletionRequest(
        system=system,
        user=user,
        response_schema_name="ontology_mapping",
        metadata={"document_type": document_type, "chunk_count": len(chunks)},
    )

    async def _invoke() -> OntologyMappingResult:
        completion = await complete_structured(request, OntologyMappingLLMOutput)
        audit_fabric.log(
            "ontology_mapping_llm_response",
            entity_type="llm",
            entity_id=completion.provider_id,
            payload={
                "provider": completion.provider_id,
                "model": completion.model,
                "usage": completion.usage,
            },
        )
        out = OntologyMappingLLMOutput.model_validate_json(completion.raw_text)
        return _llm_output_to_result(out)

    return await _invoke()


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
        payload={"chunk_count": len(chunks), "document_type": document_type, "org_id": org_id},
    )
    audit_fabric.log(
        "ontology_mapping_llm_request",
        entity_type="document",
        entity_id=document_id,
        payload={
            "chunk_count": len(chunks),
            "document_type": document_type,
            "char_estimate": sum(len(c.content) for c in chunks),
        },
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
