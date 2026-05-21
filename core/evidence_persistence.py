# core/evidence_persistence.py — Persist ingested evidence to Postgres compliance graph tables.

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit_fabric import audit_fabric
from ontology.models import Evidence, OntologyMappingResult

logger = structlog.get_logger()


@dataclass(frozen=True)
class IngestLinkHints:
    """Optional UI context from multipart upload (finding / control scope)."""

    finding_id: str | None = None
    control_id: str | None = None
    framework_id: str | None = None
    filename: str | None = None
    description: str | None = None


@dataclass(frozen=True)
class PersistedIngestEvidence:
    evidence_id: str
    title: str
    controls_linked: int
    finding_linked: bool


def collect_control_links(
    mapping: OntologyMappingResult,
    hints: IngestLinkHints | None = None,
) -> list[tuple[str, str]]:
    """Unique (control_id, framework_id) pairs from LLM mapping plus upload hints."""
    seen: set[tuple[str, str]] = set()
    out: list[tuple[str, str]] = []

    def add(control_id: str, framework_id: str) -> None:
        cid = control_id.strip()
        fid = framework_id.strip()
        if not cid or not fid:
            return
        key = (cid, fid)
        if key in seen:
            return
        seen.add(key)
        out.append(key)

    for ctrl in mapping.controls:
        add(ctrl.control_id, ctrl.framework_id)

    for obl in mapping.obligations:
        for ref in obl.control_refs:
            add(ref.control_id, ref.framework_id)

    if hints:
        if hints.control_id and hints.framework_id:
            add(hints.control_id, hints.framework_id)
        elif hints.control_id:
            fw = (hints.framework_id or "").strip()
            if fw:
                add(hints.control_id, fw)

    return out


def _evidence_title(hints: IngestLinkHints | None, document_id: str) -> str:
    if hints and hints.filename and hints.filename.strip():
        return hints.filename.strip()[:500]
    if hints and hints.description and hints.description.strip():
        return hints.description.strip()[:500]
    return f"Ingested document {document_id}"


def _link_strength(confidence: float) -> str:
    return "FULL" if confidence >= 0.75 else "PARTIAL"


async def persist_ingested_evidence(
    session: AsyncSession,
    *,
    org_id: str,
    document_id: str,
    mapping: OntologyMappingResult,
    evidence_list: list[Evidence],
    content_digest: str,
    hints: IngestLinkHints | None = None,
    actor: str = "system",
) -> PersistedIngestEvidence | None:
    """
    Insert one evidence row and evidence_controls links for the org compliance graph.
    Returns None when graph tables are not migrated (ProgrammingError).
    """
    links = collect_control_links(mapping, hints)
    if not links and not evidence_list:
        return None

    title = _evidence_title(hints, document_id)
    description = (hints.description if hints else None) or ""
    strength = _link_strength(mapping.confidence_score)
    evidence_uuid = uuid.uuid4()
    raw_data: dict[str, Any] = {
        "document_id": document_id,
        "content_hash": content_digest,
        "confidence_score": mapping.confidence_score,
        "requires_human_review": mapping.requires_human_review,
        "ontology_evidence_ids": [e.id for e in evidence_list],
        "actor": actor,
    }
    if hints and hints.finding_id:
        raw_data["finding_id"] = hints.finding_id

    audit_fabric.log(
        "evidence_persist_start",
        entity_type="evidence",
        entity_id=str(evidence_uuid),
        payload={"org_id": org_id, "document_id": document_id, "controls": len(links)},
    )

    try:
        await session.execute(
            text(
                """
                INSERT INTO evidence (
                    id, org_id, title, description, evidence_type, source,
                    status, collected_at, hash, raw_data
                )
                VALUES (
                    CAST(:id AS uuid), :org_id, :title, :description, :evidence_type, :source,
                    'VALID', NOW(), :hash, CAST(:raw_data AS jsonb)
                )
                """
            ),
            {
                "id": str(evidence_uuid),
                "org_id": org_id,
                "title": title,
                "description": description[:2000],
                "evidence_type": "DOCUMENT",
                "source": "ingest",
                "hash": content_digest,
                "raw_data": json.dumps(raw_data),
            },
        )

        linked = 0
        for control_id, framework_id in links:
            await session.execute(
                text(
                    """
                    INSERT INTO evidence_controls (evidence_id, control_id, framework_id, strength)
                    VALUES (CAST(:evidence_id AS uuid), :control_id, :framework_id, :strength)
                    ON CONFLICT (evidence_id, control_id, framework_id) DO NOTHING
                    """
                ),
                {
                    "evidence_id": str(evidence_uuid),
                    "control_id": control_id,
                    "framework_id": framework_id,
                    "strength": strength,
                },
            )
            linked += 1

        await session.commit()

        finding_linked = False
        if hints and hints.finding_id:
            from api.findings import attach_evidence_to_finding

            finding_linked = attach_evidence_to_finding(
                hints.finding_id,
                evidence_id=str(evidence_uuid),
                title=title,
                document_id=document_id,
            )

        audit_fabric.log(
            "evidence_persist_done",
            entity_type="evidence",
            entity_id=str(evidence_uuid),
            payload={
                "org_id": org_id,
                "controls_linked": linked,
                "finding_linked": finding_linked,
            },
        )

        return PersistedIngestEvidence(
            evidence_id=str(evidence_uuid),
            title=title,
            controls_linked=linked,
            finding_linked=finding_linked,
        )
    except ProgrammingError:
        await session.rollback()
        logger.warning("evidence_persist_skipped", reason="compliance_graph_tables_missing")
        return None
    except Exception:
        await session.rollback()
        raise
