# core/shasta_evidence_links.py — Append-only control-link rows from framework_controls JSON (Postgres).

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


def iter_control_links_from_framework_controls(
    framework_controls: Any,
) -> list[tuple[str, str]]:
    """Expand ``framework_controls`` JSON to (family, control_ref) pairs."""
    out: list[tuple[str, str]] = []
    if framework_controls is None:
        return out
    if hasattr(framework_controls, "keys"):
        fw = dict(framework_controls)
    elif isinstance(framework_controls, dict):
        fw = framework_controls
    else:
        return out
    for family, refs in fw.items():
        fam = str(family)
        if not isinstance(refs, list):
            continue
        for ref in refs:
            rid = str(ref).strip()
            if rid:
                out.append((fam, rid))
    return out


async def sync_evidence_control_links_for_run(
    session: AsyncSession,
    *,
    run_uuid: uuid.UUID,
    org_id: str,
) -> int:
    """Insert link rows for all findings in this run. Idempotent via ON CONFLICT DO NOTHING."""
    result = await session.execute(
        text(
            """
            SELECT id, framework_controls
            FROM shasta_cloud_findings
            WHERE scan_run_id = CAST(:rid AS uuid) AND org_id = :org_id
            """
        ),
        {"rid": str(run_uuid), "org_id": org_id},
    )
    attempts = 0
    for row in result.mappings().all():
        fid = row["id"]
        pairs = iter_control_links_from_framework_controls(row["framework_controls"])
        for family, cref in pairs:
            attempts += 1
            await session.execute(
                text(
                    """
                    INSERT INTO shasta_evidence_control_links (
                        scan_run_id, org_id, finding_id, framework_family, control_ref, source_engine
                    )
                    VALUES (
                        CAST(:scan_run_id AS uuid), :org_id, :finding_id, :framework_family, :control_ref, 'shasta'
                    )
                    ON CONFLICT (finding_id, framework_family, control_ref) DO NOTHING
                    """
                ),
                {
                    "scan_run_id": str(run_uuid),
                    "org_id": org_id,
                    "finding_id": fid,
                    "framework_family": family[:200],
                    "control_ref": cref[:500],
                },
            )
    logger.info(
        "shasta_evidence_links_synced",
        scan_run_id=str(run_uuid),
        org_id=org_id,
        link_insert_attempts=attempts,
    )
    return attempts
