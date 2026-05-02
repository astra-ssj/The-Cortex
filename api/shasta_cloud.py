# shasta_cloud.py — Org-scoped Shasta scans, Postgres persistence, JSON ingest (ZTAIP: audit_fabric on persist).
# Requires PYTHONPATH to include services/compliance-engine (see CORTEX_SETUP.md); same as Dockerfile ENV.

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from typing import Any, Literal

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from core.audit_fabric import audit_fabric
from core.shasta_queue import enqueue_shasta_scan_job, redis_url_configured
from db.session import async_session_factory
from core.security import get_current_user
from core.tenant import resolve_scoped_org_id
from core.shasta_evidence_links import sync_evidence_control_links_for_run
from core.shasta_evidence_map import EvidenceMapOut, build_evidence_map_from_findings

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/shasta", tags=["shasta-cloud"])


def _actor_label(user: dict[str, Any]) -> str:
    return str(user.get("email") or user.get("user_id") or "unknown")[:500]


class ShastaScanRequest(BaseModel):
    cloud: Literal["aws", "azure"]
    org_id: str = Field(..., description="Organisation scope (must match JWT or demo-org-001)")


class ShastaIngestRequest(BaseModel):
    """Import pre-serialized Shasta findings (subprocess / offline runner)."""

    org_id: str
    cloud: Literal["aws", "azure"]
    engine_scan_id: str | None = None
    findings: list[dict[str, Any]] = Field(default_factory=list)


def _nf_to_row(
    run_uuid: uuid.UUID,
    org_id: str,
    nf: Any,
) -> dict[str, Any]:
    fw = nf.framework_controls or {}
    collected = nf.collected_at
    if collected:
        try:
            collected_dt = datetime.fromisoformat(collected.replace("Z", "+00:00"))
        except ValueError:
            collected_dt = None
    else:
        collected_dt = None
    return {
        "scan_run_id": str(run_uuid),
        "org_id": org_id,
        "finding_key": nf.finding_key,
        "external_id": nf.external_id or None,
        "source_engine": nf.source_engine or "shasta",
        "cloud_provider": nf.cloud_provider or None,
        "account_scope": nf.account_scope or None,
        "region": nf.region or None,
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


async def _bulk_insert_findings(
    session: AsyncSession,
    run_uuid: uuid.UUID,
    org_id: str,
    normalized: list[Any],
) -> None:
    for nf in normalized:
        row = _nf_to_row(run_uuid, org_id, nf)
        await session.execute(
            text(
                """
                INSERT INTO shasta_cloud_findings (
                    scan_run_id, org_id, finding_key, external_id, source_engine,
                    cloud_provider, account_scope, region, check_id, title, description,
                    severity_normalized, compliance_status, resource_type, resource_id,
                    framework_controls, remediation, collected_at, raw_finding
                )
                VALUES (
                    CAST(:scan_run_id AS uuid), :org_id, :finding_key, :external_id, :source_engine,
                    :cloud_provider, :account_scope, :region, :check_id, :title, :description,
                    :severity_normalized, :compliance_status, :resource_type, :resource_id,
                    CAST(:framework_controls_json AS jsonb), :remediation, :collected_at, CAST(:raw_finding_json AS jsonb)
                )
                ON CONFLICT (scan_run_id, finding_key) DO NOTHING
                """
            ),
            {
                **row,
                "framework_controls_json": row["framework_controls_json"],
                "raw_finding_json": row["raw_finding_json"],
            },
        )


async def _create_running_scan_row(
    session: AsyncSession,
    *,
    org_id: str,
    cloud: Literal["aws", "azure"],
    created_by: str,
) -> uuid.UUID:
    """Insert ``running`` row so POST /scans returns immediately; worker fills results."""
    run_uuid = uuid.uuid4()
    audit_fabric.log(
        "shasta_scan_run_enqueued",
        entity_type="evidence",
        entity_id=str(run_uuid),
        payload={"org_id": org_id, "cloud": cloud},
    )
    await session.execute(
        text(
            """
            INSERT INTO shasta_scan_runs (
                id, org_id, cloud, engine, engine_scan_id, findings_count,
                status, error_message, created_by, completed_at
            )
            VALUES (
                CAST(:id AS uuid), :org_id, :cloud, 'shasta', '', 0,
                'running', NULL, :created_by, NULL
            )
            """
        ),
        {
            "id": str(run_uuid),
            "org_id": org_id,
            "cloud": cloud,
            "created_by": created_by,
        },
    )
    return run_uuid


async def _finalize_scan_success(
    session: AsyncSession,
    *,
    run_uuid: uuid.UUID,
    org_id: str,
    cloud: Literal["aws", "azure"],
    engine_scan_id: str,
    normalized: list[Any],
) -> None:
    fc = len(normalized)
    audit_fabric.log(
        "shasta_findings_persist_start",
        entity_type="evidence",
        entity_id=str(run_uuid),
        payload={"org_id": org_id, "cloud": cloud, "findings_count": fc},
    )
    await session.execute(
        text(
            """
            UPDATE shasta_scan_runs SET
                engine_scan_id = :engine_scan_id,
                findings_count = :findings_count,
                status = 'completed',
                error_message = NULL,
                completed_at = now()
            WHERE id = CAST(:id AS uuid) AND org_id = :org_id
            """
        ),
        {
            "id": str(run_uuid),
            "org_id": org_id,
            "engine_scan_id": engine_scan_id or "",
            "findings_count": fc,
        },
    )
    await _bulk_insert_findings(session, run_uuid, org_id, normalized)
    await sync_evidence_control_links_for_run(session, run_uuid=run_uuid, org_id=org_id)
    audit_fabric.log(
        "shasta_findings_persist_done",
        entity_type="evidence",
        entity_id=str(run_uuid),
        payload={"org_id": org_id, "persisted": fc},
    )


async def _mark_scan_failed(
    session: AsyncSession,
    *,
    run_uuid: uuid.UUID,
    org_id: str,
    error_message: str,
) -> None:
    msg = (error_message or "unknown error")[:4000]
    await session.execute(
        text(
            """
            UPDATE shasta_scan_runs SET
                status = 'failed',
                error_message = :error_message,
                completed_at = now(),
                findings_count = 0
            WHERE id = CAST(:id AS uuid) AND org_id = :org_id
            """
        ),
        {"id": str(run_uuid), "org_id": org_id, "error_message": msg},
    )
    audit_fabric.log(
        "shasta_scan_run_failed",
        entity_type="evidence",
        entity_id=str(run_uuid),
        payload={"org_id": org_id, "error": msg[:500]},
    )


async def _run_shasta_scan_background(
    run_uuid: uuid.UUID,
    org_id: str,
    cloud: Literal["aws", "azure"],
) -> None:
    """In-process async job: Shasta already uses ``asyncio.to_thread`` inside the adapter."""
    from app.connectors.shasta.shasta_adapter import run_shasta_scan_for_stored_credentials

    async with async_session_factory() as session:
        try:
            engine_scan_id, normalized = await run_shasta_scan_for_stored_credentials(cloud)
            await _finalize_scan_success(
                session,
                run_uuid=run_uuid,
                org_id=org_id,
                cloud=cloud,
                engine_scan_id=engine_scan_id,
                normalized=normalized,
            )
            await session.commit()
        except ValueError as e:
            await session.rollback()
            async with async_session_factory() as s2:
                await _mark_scan_failed(
                    s2, run_uuid=run_uuid, org_id=org_id, error_message=str(e)
                )
                await s2.commit()
        except ImportError as e:
            await session.rollback()
            async with async_session_factory() as s2:
                await _mark_scan_failed(
                    s2, run_uuid=run_uuid, org_id=org_id, error_message=str(e)
                )
                await s2.commit()
        except Exception as e:
            await session.rollback()
            logger.exception(
                "shasta_scan_run_failed",
                scan_run_id=str(run_uuid),
                org_id=org_id,
                error=str(e),
            )
            async with async_session_factory() as s2:
                await _mark_scan_failed(
                    s2, run_uuid=run_uuid, org_id=org_id, error_message=str(e)
                )
                await s2.commit()


async def _persist_normalized_batch(
    session: AsyncSession,
    *,
    org_id: str,
    cloud: Literal["aws", "azure"],
    engine_scan_id: str,
    normalized: list[Any],
    created_by: str,
    status: str = "completed",
    error_message: str | None = None,
) -> uuid.UUID:
    run_uuid = uuid.uuid4()
    fc = len(normalized)
    audit_fabric.log(
        "shasta_findings_persist_start",
        entity_type="evidence",
        entity_id=str(run_uuid),
        payload={"org_id": org_id, "cloud": cloud, "findings_count": fc},
    )
    await session.execute(
        text(
            """
            INSERT INTO shasta_scan_runs (
                id, org_id, cloud, engine, engine_scan_id, findings_count,
                status, error_message, created_by, completed_at
            )
            VALUES (
                CAST(:id AS uuid), :org_id, :cloud, 'shasta', :engine_scan_id, :findings_count,
                :status, :error_message, :created_by,
                CASE WHEN :status = 'completed' THEN now() ELSE NULL END
            )
            """
        ),
        {
            "id": str(run_uuid),
            "org_id": org_id,
            "cloud": cloud,
            "engine_scan_id": engine_scan_id or "",
            "findings_count": fc,
            "status": status,
            "error_message": error_message,
            "created_by": created_by,
        },
    )
    await _bulk_insert_findings(session, run_uuid, org_id, normalized)
    await sync_evidence_control_links_for_run(session, run_uuid=run_uuid, org_id=org_id)
    audit_fabric.log(
        "shasta_findings_persist_done",
        entity_type="evidence",
        entity_id=str(run_uuid),
        payload={"org_id": org_id, "persisted": fc},
    )
    return run_uuid


@router.get("/contract")
async def shasta_contract_public() -> dict[str, Any]:
    """Install / subprocess contract (no auth; static reference)."""
    from app.connectors.shasta.shasta_adapter import shasta_contract_payload

    return shasta_contract_payload("any")


@router.post("/scans")
async def run_shasta_scan_persisted(
    body: ShastaScanRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Enqueue Shasta scan — returns ``scan_run_id`` with ``running``; worker persists to Postgres.

    If ``REDIS_URL`` / ``SHASTA_REDIS_URL`` is set and ``redis-queue`` extra is installed, the job is
    **LPUSH**ed for ``workers/shasta_worker.py`` (``delivery: redis``). Otherwise Starlette
    ``BackgroundTasks`` runs ``_run_shasta_scan_background`` in-process (``delivery: in_process``).

    Poll GET ``/api/v1/shasta/scans`` or GET ``/api/v1/shasta/scans/{scan_run_id}`` until
    ``status`` is ``completed`` or ``failed`` (missing credentials and scan errors become ``failed``).
    """
    from app.connectors.shasta.shasta_adapter import is_shasta_installed

    org_id = resolve_scoped_org_id(current_user, body.org_id.strip())
    _mock_scan = os.getenv("CORTEX_SHASTA_MOCK", "").lower() in ("1", "true", "yes")
    if not is_shasta_installed() and not _mock_scan:
        raise HTTPException(
            status_code=501,
            detail='Install optional extra: pip install -e ".[shasta-scan]"',
        )

    actor = _actor_label(current_user)
    try:
        run_uuid = await _create_running_scan_row(
            session,
            org_id=org_id,
            cloud=body.cloud,
            created_by=actor,
        )
    except Exception as e:
        logger.exception("shasta_pending_row_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Could not enqueue scan: {e}") from e

    if redis_url_configured():
        try:
            await enqueue_shasta_scan_job(
                run_id=str(run_uuid),
                org_id=org_id,
                cloud=body.cloud,
            )
            audit_fabric.log(
                "shasta_scan_queued_redis",
                entity_type="evidence",
                entity_id=str(run_uuid),
                payload={"org_id": org_id, "cloud": body.cloud},
            )
        except Exception as e:
            logger.exception("shasta_redis_enqueue_failed", error=str(e))
            raise HTTPException(
                status_code=503,
                detail=f"Could not enqueue scan to Redis: {e}",
            ) from e
    else:
        background_tasks.add_task(
            _run_shasta_scan_background,
            run_uuid,
            org_id,
            body.cloud,
        )

    return {
        "scan_run_id": str(run_uuid),
        "status": "running",
        "org_id": org_id,
        "delivery": "redis" if redis_url_configured() else "in_process",
    }


@router.post("/ingest")
async def ingest_shasta_json(
    body: ShastaIngestRequest,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Persist externally produced Shasta-shaped finding payloads (subprocess contract)."""
    from app.connectors.shasta.shasta_adapter import shasta_finding_payload_to_normalized

    org_id = resolve_scoped_org_id(current_user, body.org_id.strip())
    scan_ref = body.engine_scan_id or f"ingest-{uuid.uuid4().hex[:12]}"
    normalized = [
        shasta_finding_payload_to_normalized(scan_ref, dict(p)) for p in body.findings
    ]
    actor = _actor_label(current_user)
    run_uuid = await _persist_normalized_batch(
        session,
        org_id=org_id,
        cloud=body.cloud,
        engine_scan_id=scan_ref,
        normalized=normalized,
        created_by=actor,
    )
    return {"scan_run_id": str(run_uuid), "ingested": len(normalized), "org_id": org_id}


@router.get("/scans")
async def list_shasta_scans(
    org_id: str = Query(..., description="Organisation id"),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict[str, Any]]:
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    result = await session.execute(
        text(
            """
            SELECT id::text, org_id, cloud, engine_scan_id, findings_count, status,
                   created_by, started_at, completed_at, error_message
            FROM shasta_scan_runs
            WHERE org_id = :org_id
            ORDER BY started_at DESC
            LIMIT :limit
            """
        ),
        {"org_id": effective, "limit": limit},
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]


@router.get("/scans/{scan_run_id}")
async def get_shasta_scan_run(
    scan_run_id: str,
    org_id: str = Query(..., description="Organisation id"),
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Single run row for polling (JWT + org scope)."""
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    result = await session.execute(
        text(
            """
            SELECT id::text, org_id, cloud, engine_scan_id, findings_count, status,
                   created_by, started_at, completed_at, error_message
            FROM shasta_scan_runs
            WHERE id = CAST(:sid AS uuid) AND org_id = :org_id
            """
        ),
        {"sid": scan_run_id, "org_id": effective},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Scan run not found for this organisation")
    return dict(row)


@router.get("/scans/{scan_run_id}/findings")
async def list_findings_for_scan(
    scan_run_id: str,
    org_id: str = Query(..., description="Organisation id (must own the scan)"),
    limit: int = Query(500, ge=1, le=2000),
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict[str, Any]]:
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    chk = await session.execute(
        text("SELECT 1 FROM shasta_scan_runs WHERE id = CAST(:sid AS uuid) AND org_id = :org_id"),
        {"sid": scan_run_id, "org_id": effective},
    )
    if chk.first() is None:
        raise HTTPException(status_code=404, detail="Scan run not found for this organisation")
    result = await session.execute(
        text(
            """
            SELECT id, scan_run_id::text, org_id, finding_key, external_id, source_engine,
                   cloud_provider, account_scope, region, check_id, title, description,
                   severity_normalized, compliance_status, resource_type, resource_id,
                   framework_controls, remediation, collected_at, created_at
            FROM shasta_cloud_findings
            WHERE scan_run_id = CAST(:sid AS uuid) AND org_id = :org_id
            ORDER BY id
            LIMIT :limit
            """
        ),
        {"sid": scan_run_id, "org_id": effective, "limit": limit},
    )
    out: list[dict[str, Any]] = []
    for row in result.mappings().all():
        d = dict(row)
        if d.get("framework_controls") is not None and hasattr(d["framework_controls"], "keys"):
            d["framework_controls"] = dict(d["framework_controls"])
        out.append(d)
    return out


@router.get("/scans/{scan_run_id}/evidence-map", response_model=EvidenceMapOut)
async def get_evidence_map_for_scan(
    scan_run_id: str,
    org_id: str = Query(..., description="Organisation id (must own the scan)"),
    limit: int = Query(2000, ge=1, le=5000),
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> EvidenceMapOut:
    """Graph of findings → framework control refs for this run (UI / future canvas).

    ``source`` is always ``shasta``; edges encode Shasta-supplied ``framework_controls`` tags only.
    """
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    scan_row = await session.execute(
        text(
            """
            SELECT status, cloud
            FROM shasta_scan_runs
            WHERE id = CAST(:sid AS uuid) AND org_id = :org_id
            """
        ),
        {"sid": scan_run_id, "org_id": effective},
    )
    sr = scan_row.mappings().first()
    if sr is None:
        raise HTTPException(status_code=404, detail="Scan run not found for this organisation")
    scan_status = str(sr["status"])
    cloud_val = sr.get("cloud")
    cloud_out = str(cloud_val) if cloud_val is not None else None

    result = await session.execute(
        text(
            """
            SELECT id, finding_key, title, severity_normalized, check_id, resource_id,
                   framework_controls
            FROM shasta_cloud_findings
            WHERE scan_run_id = CAST(:sid AS uuid) AND org_id = :org_id
            ORDER BY id
            LIMIT :limit
            """
        ),
        {"sid": scan_run_id, "org_id": effective, "limit": limit},
    )
    rows: list[dict[str, Any]] = []
    for row in result.mappings().all():
        d = dict(row)
        if d.get("framework_controls") is not None and hasattr(d["framework_controls"], "keys"):
            d["framework_controls"] = dict(d["framework_controls"])
        rows.append(d)

    return build_evidence_map_from_findings(
        scan_run_id=scan_run_id,
        org_id=effective,
        scan_status=scan_status,
        cloud=cloud_out,
        finding_rows=rows,
    )


@router.get("/scans/{scan_run_id}/evidence-links")
async def list_evidence_control_links_for_scan(
    scan_run_id: str,
    org_id: str = Query(..., description="Organisation id (must own the scan)"),
    limit: int = Query(5000, ge=1, le=20000),
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Append-only rows in ``shasta_evidence_control_links`` (audit / GRC joins)."""
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    chk = await session.execute(
        text(
            "SELECT 1 FROM shasta_scan_runs WHERE id = CAST(:sid AS uuid) AND org_id = :org_id"
        ),
        {"sid": scan_run_id, "org_id": effective},
    )
    if chk.first() is None:
        raise HTTPException(status_code=404, detail="Scan run not found for this organisation")
    result = await session.execute(
        text(
            """
            SELECT id, scan_run_id::text, org_id, finding_id, framework_family, control_ref,
                   source_engine, created_at
            FROM shasta_evidence_control_links
            WHERE scan_run_id = CAST(:sid AS uuid) AND org_id = :org_id
            ORDER BY id
            LIMIT :limit
            """
        ),
        {"sid": scan_run_id, "org_id": effective, "limit": limit},
    )
    return [dict(r) for r in result.mappings().all()]


@router.get("/findings")
async def list_recent_cloud_findings(
    org_id: str = Query(..., description="Organisation id"),
    severity: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Latest cloud findings across scans for an organisation."""
    effective = resolve_scoped_org_id(current_user, org_id.strip())
    params: dict[str, Any] = {"org_id": effective, "limit": limit}
    if severity and severity.strip():
        params["sev"] = severity.strip()
        result = await session.execute(
            text(
                """
                SELECT f.id, f.scan_run_id::text, f.org_id, f.finding_key, f.external_id,
                       f.cloud_provider, f.account_scope, f.region, f.check_id, f.title,
                       f.severity_normalized, f.compliance_status, f.resource_type, f.resource_id,
                       f.framework_controls, f.remediation, f.collected_at, f.created_at
                FROM shasta_cloud_findings f
                WHERE f.org_id = :org_id AND severity_normalized = :sev
                ORDER BY f.created_at DESC
                LIMIT :limit
                """
            ),
            params,
        )
    else:
        result = await session.execute(
            text(
                """
                SELECT f.id, f.scan_run_id::text, f.org_id, f.finding_key, f.external_id,
                       f.cloud_provider, f.account_scope, f.region, f.check_id, f.title,
                       f.severity_normalized, f.compliance_status, f.resource_type, f.resource_id,
                       f.framework_controls, f.remediation, f.collected_at, f.created_at
                FROM shasta_cloud_findings f
                WHERE f.org_id = :org_id
                ORDER BY f.created_at DESC
                LIMIT :limit
                """
            ),
            params,
        )
    out = []
    for row in result.mappings().all():
        d = dict(row)
        if d.get("framework_controls") is not None and hasattr(d["framework_controls"], "keys"):
            d["framework_controls"] = dict(d["framework_controls"])
        out.append(d)
    return out
