# Shim — canonical implementation: app.services.ingestion.document_processor (compliance-engine).

from __future__ import annotations

from app.services.ingestion.document_processor import (
    CHUNK_OVERLAP,
    CHUNK_TOKEN_TARGET,
    CHARS_PER_TOKEN,
    DocumentChunk,
    DocumentType,
    extract_text_docx,
    extract_text_pdf,
    extract_text_txt,
    process_document,
    _chunk_text,
)

__all__ = [
    "CHUNK_OVERLAP",
    "CHUNK_TOKEN_TARGET",
    "CHARS_PER_TOKEN",
    "DocumentChunk",
    "DocumentType",
    "_chunk_text",
    "extract_text_docx",
    "extract_text_pdf",
    "extract_text_txt",
    "process_document",
]
