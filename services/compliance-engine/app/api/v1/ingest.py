# ingest.py — POST /api/v1/ingest/document: multipart upload, validate type/size, pipeline + SSE (same pattern as assessments).

from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path
from typing import Literal, cast

import structlog
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from core.audit_fabric import audit_fabric
from core.tenant import DEMO_ORG_ID
from app.services.ingestion import (
    create_evidence_from_mapping,
    map_chunks_to_ontology,
    process_document,
)

logger = structlog.get_logger()

router = APIRouter(tags=["ingestion"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {"pdf", "docx", "txt"}
EXT_TO_TYPE = {"pdf": "pdf", "docx": "docx", "txt": "txt"}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _run_ingest_stream(content: bytes, ext: str, document_type: str, document_id: str):
    """Pipeline: process → map → evidence; yield SSE events. Audit before and after."""
    tmp_path = None
    success = False
    audit_fabric.log(
        "ingest_start",
        entity_type="document",
        entity_id=document_id,
        payload={"document_type": document_type, "size_bytes": len(content)},
    )
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)
        yield _sse("progress", {"stage": "processing", "message": "Extracting text and chunking"})
        doc_type: Literal["pdf", "docx", "txt"] = cast(Literal["pdf", "docx", "txt"], document_type)
        chunks = process_document(tmp_path, doc_type)
        yield _sse("progress", {"stage": "chunks", "chunk_count": len(chunks)})
        if not chunks:
            yield _sse("progress", {"stage": "done", "message": "No text extracted"})
            yield _sse("summary", {"controls_mapped": 0, "evidence_created": 0, "confidence_scores": []})
            success = True
            return
        yield _sse("progress", {"stage": "mapping", "message": "Mapping to ontology via LLM"})
        mapping = await map_chunks_to_ontology(chunks, document_type, document_id, DEMO_ORG_ID)
        yield _sse(
            "mapping_done",
            {
                "controls": len(mapping.controls),
                "obligations": len(mapping.obligations),
                "confidence_score": mapping.confidence_score,
                "requires_human_review": mapping.requires_human_review,
            },
        )
        full_content = "\n\n".join(c.content for c in chunks)
        evidence_list = create_evidence_from_mapping(mapping, full_content, document_id)
        yield _sse("evidence_created", {"count": len(evidence_list)})
        yield _sse(
            "summary",
            {
                "controls_mapped": len(mapping.controls),
                "evidence_created": len(evidence_list),
                "confidence_scores": [mapping.confidence_score],
            },
        )
        yield _sse("done", {})
        success = True
    except Exception as e:
        logger.exception("ingest_pipeline_error", document_id=document_id)
        audit_fabric.log(
            "ingest_error",
            entity_type="document",
            entity_id=document_id,
            payload={"error": str(e)},
        )
        yield _sse("error", {"message": str(e)})
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        audit_fabric.log(
            "ingest_done",
            entity_type="document",
            entity_id=document_id,
            payload={"success": success},
        )


def _reject_path_traversal(filename: str | None) -> None:
    """Reject filenames that could indicate path traversal (security)."""
    if not filename or filename.strip() == "":
        raise HTTPException(status_code=400, detail="Missing or empty filename")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename: path traversal not allowed")


@router.post("/ingest/document")
async def ingest_document(file: UploadFile = File(...)):
    """
    Accept multipart file upload. Validate file type (PDF, DOCX, TXT) and size (max 10MB).
    Run pipeline: process → map → create evidence. Stream progress via SSE.
    """
    _reject_path_traversal(file.filename)
    ext = (file.filename or "").split(".")[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Allowed types: {list(ALLOWED_EXTENSIONS)}")
    document_type = EXT_TO_TYPE[ext]
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit")
    document_id = "doc-" + hashlib.sha256(content[:1024]).hexdigest()[:12]
    return StreamingResponse(
        _run_ingest_stream(content, ext, document_type, document_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
            "Connection": "keep-alive",
        },
    )
