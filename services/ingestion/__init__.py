# services/ingestion — Shims re-exporting app.services.ingestion (canonical pipeline).

from __future__ import annotations

from app.services.ingestion import (
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
