# core/microsoft_cloud.py — Persist Microsoft 365 sync findings and bridge to compliance graph evidence.

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit_fabric import audit_fabric
from ontology.models import NormalizedFinding

logger = structlog.get_logger()


def is_m365_mock_mode() -> bool:
    return os.getenv("CORTEX_M365_MOCK", "1").lower() not in ("0", "false", "no")


def _nf_to_row(sync_uuid: uuid.UUID, org_id: str, nf: NormalizedFinding) -> dict[str, Any]:
    fw = nf.framework_controls or {}
    collected = nf.collected_at
    collected_dt = None
    if collected:
        try:
            from datetime import datetime

            collected_dt = datetime.fromisoformat(str(collected).replace("Z", "+00:00"))
        except ValueError:
            collected_dt = None
    return {
        "sync_run_id": str(sync_uuid),
        "org_id": org_id,
        "finding_key": nf.finding_key,
        "external_id": nf.external_id or None,
        "source_engine": nf.source_engine or "microsoft_graph",
        "check_id": nf.check_id or None,
        "title": nf.title or None,
        "description": nf.description or None,
        "severity_normalized": nf.severity_normalized or None,
        "compliance_status": nf.compliance_status or None,
        "resource_type": nf.resource_type or None,
        "resource_id": nf.resource_id or None,
        "framework_controls_json": json.dumps(fw),
        "remediation": nf.remediation or None,
        "collected_at": collected_dt,
        "raw_finding_json": json.dumps(nf.raw_finding or {}),
    }


def _parse_collected_at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def iter_framework_control_pairs(framework_controls: Any) -> list[tuple[str, str]]:
    """Expand ``{framework_id: [control_id, ...]}`` to (control_id, framework_id) pairs."""
    out: list[tuple[str, str]] = []
    if not isinstance(framework_controls, dict):
        return out
    for fw_id, refs in framework_controls.items():
        fam = str(fw_id).strip()
        if not fam or not isinstance(refs, list):
            continue
        for ref in refs:
            cid = str(ref).strip()
            if cid:
                out.append((cid, fam))
    return out


async def bulk_insert_microsoft_findings(
    session: AsyncSession,
    sync_uuid: uuid.UUID,
    org_id: str,
    normalized: list[NormalizedFinding],
) -> int:
    inserted = 0
    for nf in normalized:
        row = _nf_to_row(sync_uuid, org_id, nf)
        await session.execute(
            text(
                """
                INSERT INTO microsoft_cloud_findings (
                    sync_run_id, org_id, finding_key, external_id, source_engine,
                    check_id, title, description, severity_normalized, compliance_status,
                    resource_type, resource_id, framework_controls, remediation,
                    collected_at, raw_finding
                )
                VALUES (
                    CAST(:sync_run_id AS uuid), :org_id, :finding_key, :external_id, :source_engine,
                    :check_id, :title, :description, :severity_normalized, :compliance_status,
                    :resource_type, :resource_id,
                    CAST(:framework_controls_json AS jsonb), :remediation,
                    :collected_at, CAST(:raw_finding_json AS jsonb)
                )
                ON CONFLICT (sync_run_id, finding_key) DO NOTHING
                """
            ),
            row,
        )
        inserted += 1
    return inserted


async def bridge_findings_to_evidence(
    session: AsyncSession,
    *,
    org_id: str,
    normalized: list[NormalizedFinding],
) -> int:
    """Create evidence + evidence_controls rows from M365 findings (source=microsoft)."""
    created = 0
    try:
        for nf in normalized:
            pairs = iter_framework_control_pairs(nf.framework_controls)
            if not pairs:
                continue
            evidence_uuid = uuid.uuid4()
            title = (nf.title or nf.check_id or "Microsoft 365 signal")[:500]
            raw_data = {
                "source_engine": nf.source_engine,
                "check_id": nf.check_id,
                "external_id": nf.external_id,
                "finding_key": nf.finding_key,
            }
            collected_dt = _parse_collected_at(nf.collected_at)
            await session.execute(
                text(
                    """
                    INSERT INTO evidence (
                        id, org_id, title, description, evidence_type, source,
                        status, collected_at, raw_data
                    )
                    VALUES (
                        CAST(:id AS uuid), :org_id, :title, :description, 'SCAN', 'microsoft',
                        'VALID', COALESCE(:collected_at, NOW()),
                        CAST(:raw_data AS jsonb)
                    )
                    """
                ),
                {
                    "id": str(evidence_uuid),
                    "org_id": org_id,
                    "title": title,
                    "description": (nf.description or "")[:2000],
                    "collected_at": collected_dt,
                    "raw_data": json.dumps(raw_data),
                },
            )
            for control_id, framework_id in pairs:
                await session.execute(
                    text(
                        """
                        INSERT INTO evidence_controls (evidence_id, control_id, framework_id, strength)
                        VALUES (CAST(:evidence_id AS uuid), :control_id, :framework_id, 'PARTIAL')
                        ON CONFLICT (evidence_id, control_id, framework_id) DO NOTHING
                        """
                    ),
                    {
                        "evidence_id": str(evidence_uuid),
                        "control_id": control_id,
                        "framework_id": framework_id,
                    },
                )
            created += 1
            audit_fabric.log(
                "m365_evidence_created",
                entity_type="evidence",
                entity_id=str(evidence_uuid),
                payload={"org_id": org_id, "title": title[:80], "controls": len(pairs)},
            )
    except ProgrammingError:
        await session.rollback()
        logger.warning("m365_evidence_bridge_skipped", reason="compliance_graph_tables_missing")
        return 0
    return created


async def run_and_persist_m365_sync(
    session: AsyncSession,
    *,
    org_id: str,
    created_by: str,
    engine_sync_id: str,
    normalized: list[NormalizedFinding],
    mock_mode: bool,
) -> dict[str, Any]:
    """Insert sync run, findings, and graph evidence in one transaction."""
    sync_uuid = uuid.uuid4()
    audit_fabric.log(
        "m365_sync_persist_start",
        entity_type="connector",
        entity_id="microsoft-365",
        payload={"org_id": org_id, "sync_run_id": str(sync_uuid)},
    )
    try:
        await session.execute(
            text(
                """
                INSERT INTO microsoft_sync_runs (
                    id, org_id, engine, engine_sync_id, findings_count,
                    status, mock_mode, created_by, completed_at
                )
                VALUES (
                    CAST(:id AS uuid), :org_id, 'microsoft_graph', :engine_sync_id, :findings_count,
                    'completed', :mock_mode, :created_by, now()
                )
                """
            ),
            {
                "id": str(sync_uuid),
                "org_id": org_id,
                "engine_sync_id": engine_sync_id,
                "findings_count": len(normalized),
                "mock_mode": mock_mode,
                "created_by": created_by,
            },
        )
        await bulk_insert_microsoft_findings(session, sync_uuid, org_id, normalized)
        evidence_created = await bridge_findings_to_evidence(
            session, org_id=org_id, normalized=normalized
        )
        await session.commit()
        audit_fabric.log(
            "m365_sync_persist_done",
            entity_type="connector",
            entity_id="microsoft-365",
            payload={
                "org_id": org_id,
                "sync_run_id": str(sync_uuid),
                "findings": len(normalized),
                "evidence_created": evidence_created,
            },
        )
        return {
            "sync_run_id": str(sync_uuid),
            "findings_count": len(normalized),
            "evidence_created": evidence_created,
            "mock_mode": mock_mode,
            "status": "completed",
        }
    except ProgrammingError as e:
        await session.rollback()
        logger.warning("m365_sync_tables_missing", error=str(e))
        raise ValueError(
            "Microsoft integration tables not applied. Run migration 014_microsoft_integration.sql."
        ) from e


async def get_m365_connection_status(session: AsyncSession, org_id: str) -> dict[str, Any]:
    """Last sync summary for integrations hub UI."""
    try:
        row = (
            await session.execute(
                text(
                    """
                    SELECT id::text AS id, status, findings_count, mock_mode,
                           started_at, completed_at, engine_sync_id
                    FROM microsoft_sync_runs
                    WHERE org_id = :org_id
                    ORDER BY started_at DESC
                    LIMIT 1
                    """
                ),
                {"org_id": org_id},
            )
        ).mappings().one_or_none()
        if not row:
            return {
                "connected": False,
                "status": "not_connected",
                "mock_mode": is_m365_mock_mode(),
                "last_sync_at": None,
                "findings_count": 0,
            }
        return {
            "connected": str(row.get("status")) == "completed",
            "status": "connected" if row.get("status") == "completed" else str(row.get("status")),
            "mock_mode": bool(row.get("mock_mode")),
            "last_sync_at": str(row.get("completed_at") or row.get("started_at") or ""),
            "findings_count": int(row.get("findings_count") or 0),
            "sync_run_id": row.get("id"),
            "engine_sync_id": row.get("engine_sync_id"),
        }
    except ProgrammingError:
        await session.rollback()
        return {
            "connected": False,
            "status": "not_connected",
            "mock_mode": is_m365_mock_mode(),
            "last_sync_at": None,
            "findings_count": 0,
        }
