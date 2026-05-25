# ingest.py — POST /api/v1/ingest/document: multipart upload, validate type/size, pipeline + SSE (same pattern as assessments).

from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path
from typing import Any, Literal, cast

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from core.audit_fabric import audit_fabric
from core.evidence_persistence import IngestLinkHints, persist_ingested_evidence
from core.rbac import Permission, require_permission
from core.tenant import resolve_scoped_org_id
from db.session import async_session_factory
from app.services.ingestion import (
    create_evidence_from_mapping,
    map_chunks_to_ontology,
    process_document,
)
from app.services.ingestion.evidence_creator import content_hash

logger = structlog.get_logger()

router = APIRouter(tags=["ingestion"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {"pdf", "docx", "txt"}
EXT_TO_TYPE = {"pdf": "pdf", "docx": "docx", "txt": "txt"}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _run_ingest_stream(
    content: bytes,
    ext: str,
    document_type: str,
    document_id: str,
    org_id: str,
    actor: str,
    hints: IngestLinkHints,
    filename: str,
):
    """Pipeline: process → map → evidence; yield SSE events. Audit before and after."""
    tmp_path = None
    success = False
    audit_fabric.log(
        "ingest_start",
        entity_type="document",
        entity_id=document_id,
        payload={
            "document_type": document_type,
            "size_bytes": len(content),
            "org_id": org_id,
            "actor": actor,
        },
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
        mapping = await map_chunks_to_ontology(chunks, document_type, document_id, org_id)
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

        digest = content_hash(full_content)
        link_hints = IngestLinkHints(
            finding_id=hints.finding_id,
            control_id=hints.control_id or None,
            framework_id=hints.framework_id or None,
            filename=filename or hints.filename,
            description=hints.description,
        )
        persisted = None
        async with async_session_factory() as session:
            persisted = await persist_ingested_evidence(
                session,
                org_id=org_id,
                document_id=document_id,
                mapping=mapping,
                evidence_list=evidence_list,
                content_digest=digest,
                hints=link_hints,
                actor=actor,
            )
        if persisted:
            yield _sse(
                "persisted",
                {
                    "evidence_id": persisted.evidence_id,
                    "title": persisted.title,
                    "controls_linked": persisted.controls_linked,
                    "finding_linked": persisted.finding_linked,
                },
            )

        yield _sse(
            "summary",
            {
                "controls_mapped": len(mapping.controls),
                "evidence_created": len(evidence_list),
                "confidence_scores": [mapping.confidence_score],
                "persisted": persisted is not None,
                "evidence_id": persisted.evidence_id if persisted else None,
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
            payload={"error": str(e), "org_id": org_id},
        )
        yield _sse("error", {"message": str(e)})
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        audit_fabric.log(
            "ingest_done",
            entity_type="document",
            entity_id=document_id,
            payload={"success": success, "org_id": org_id},
        )


def _reject_path_traversal(filename: str | None) -> None:
    """Reject filenames that could indicate path traversal (security)."""
    if not filename or filename.strip() == "":
        raise HTTPException(status_code=400, detail="Missing or empty filename")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename: path traversal not allowed")


def _actor_label(user: dict[str, Any]) -> str:
    return str(user.get("email") or user.get("user_id") or user.get("sub") or "unknown")[:500]


@router.post("/ingest/document")
async def ingest_document(
    file: UploadFile = File(...),
    finding_id: str | None = Form(None),
    control_id: str | None = Form(None),
    framework_id: str | None = Form(None),
    org_id: str | None = Form(None),
    description: str | None = Form(None),
    current_user: dict[str, Any] = Depends(require_permission(Permission.ingest_document)),
):
    """
    Accept multipart file upload. Validate file type (PDF, DOCX, TXT) and size (max 10MB).
    Run pipeline: process → map → create evidence. Stream progress via SSE.
    Requires ``ingest_document`` permission (admin / analyst).
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
    # Do not silently fall back to the shared demo org for writes; require an explicit scope.
    scoped_org = resolve_scoped_org_id(
        current_user,
        str(org_id or current_user.get("org_id") or "").strip(),
    )
    actor = _actor_label(current_user)
    hints = IngestLinkHints(
        finding_id=(finding_id or "").strip() or None,
        control_id=(control_id or "").strip() or None,
        framework_id=(framework_id or "").strip() or None,
        filename=file.filename,
        description=(description or "").strip() or None,
    )
    return StreamingResponse(
        _run_ingest_stream(
            content,
            ext,
            document_type,
            document_id,
            scoped_org,
            actor,
            hints,
            file.filename or "document",
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
            "Connection": "keep-alive",
        },
    )
