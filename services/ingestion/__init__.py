# services/ingestion — Compatibility shim; canonical pipeline is core.ingestion.

from __future__ import annotations

from core.ingestion import (
    DocumentChunk,
    create_evidence_from_mapping,
    map_chunks_to_ontology,
    process_document,
)

__all__ = [
    "DocumentChunk",
    "create_evidence_from_mapping",
    "map_chunks_to_ontology",
    "process_document",
]
