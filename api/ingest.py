# ingest.py — POST /api/v1/ingest/document: multipart upload, validate type/size, pipeline + SSE (same pattern as assessments).

from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path
from typing import Any, Literal, cast

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from api.limits import authenticated_rate_limit_key, limiter
from core.audit_fabric import audit_fabric
from core.rbac import Permission, require_permission
from core.tenant import DEMO_ORG_ID, resolve_writable_org_id
from core.ingestion import (
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


async def _run_ingest_stream(
    content: bytes,
    ext: str,
    document_type: str,
    document_id: str,
    org_id: str,
    actor: str,
    filename: str = "",
    finding_id: str | None = None,
    control_id: str | None = None,
    framework_id: str | None = None,
    description: str | None = None,
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
            "finding_id": finding_id,
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

        evidence_id = evidence_list[0].id if evidence_list else f"ev-{document_id}-0"
        finding_linked = False
        controls_linked = len(mapping.controls)

        if finding_id:
            try:
                from datetime import datetime, timezone
                from sqlalchemy import text
                from db.session import async_session_factory
                from core.tenant import set_tenant_context
                from core.audit_fabric import append_audit_log

                async with async_session_factory() as session:
                    await set_tenant_context(session, org_id)
                    res = await session.execute(
                        text("SELECT id, evidence, notes FROM findings WHERE id = :id AND org_id = :org_id"),
                        {"id": finding_id, "org_id": org_id},
                    )
                    f_row = res.mappings().first()
                    if f_row:
                        existing_evidence = list(f_row["evidence"] or [])
                        existing_notes = list(f_row["notes"] or [])
                        ev_item = {
                            "id": evidence_id,
                            "document_id": document_id,
                            "filename": filename or f"{document_id}.{ext}",
                            "content_hash": hashlib.sha256(content).hexdigest(),
                            "evidence_type": "POLICY_DOCUMENT",
                            "uploaded_at": datetime.now(timezone.utc).isoformat(),
                            "uploaded_by": actor,
                            "controls": [c.control_id for c in mapping.controls],
                            "description": description or f"Evidence document {filename or document_id}",
                        }
                        existing_evidence.append(ev_item)
                        note_text = f"Attached evidence {filename or document_id} ({len(mapping.controls)} controls mapped)"
                        existing_notes.append({
                            "text": note_text,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "author": actor,
                        })
                        await session.execute(
                            text(
                                "UPDATE findings SET evidence = :evidence, notes = :notes, updated_at = now() "
                                "WHERE id = :id AND org_id = :org_id"
                            ),
                            {
                                "id": finding_id,
                                "org_id": org_id,
                                "evidence": json.dumps(existing_evidence),
                                "notes": json.dumps(existing_notes),
                            },
                        )
                        await append_audit_log(
                            session,
                            event_type="finding_evidence_attached",
                            entity_type="finding",
                            entity_id=finding_id,
                            payload={
                                "org_id": org_id,
                                "evidence_id": evidence_id,
                                "document_id": document_id,
                                "filename": filename or document_id,
                            },
                        )
                        await session.commit()
                        finding_linked = True
            except Exception as e:
                logger.warning("failed_to_link_finding_evidence", finding_id=finding_id, error=str(e))

        yield _sse(
            "persisted",
            {
                "evidence_id": evidence_id,
                "controls_linked": controls_linked,
                "finding_linked": finding_linked,
            },
        )

        yield _sse(
            "summary",
            {
                "controls_mapped": len(mapping.controls),
                "evidence_created": len(evidence_list),
                "confidence_scores": [mapping.confidence_score],
                "evidence_id": evidence_id,
                "controls_linked": controls_linked,
                "finding_linked": finding_linked,
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
@limiter.limit("5/minute", key_func=authenticated_rate_limit_key)
async def ingest_document(
    request: Request,
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
    scoped_org = resolve_writable_org_id(
        current_user,
        str(org_id or current_user.get("org_id") or DEMO_ORG_ID).strip(),
    )
    actor = _actor_label(current_user)
    return StreamingResponse(
        _run_ingest_stream(
            content,
            ext,
            document_type,
            document_id,
            scoped_org,
            actor,
            filename=file.filename or "",
            finding_id=finding_id,
            control_id=control_id,
            framework_id=framework_id,
            description=description,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
            "Connection": "keep-alive",
        },
    )
