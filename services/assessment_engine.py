# services/assessment_engine.py — Assessment run: yields AssessmentEvent-shaped events for SSE.

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from compliance import FrameworkId, get
from compliance.models import Control

from core.audit_fabric import audit_fabric
from services.context_builder import get_context_for_control

logger = structlog.get_logger()


async def run_assessment_stream(
    session: AsyncSession,
    organization_id: str,
    framework_ids: list[FrameworkId],
) -> AsyncIterator[dict[str, Any]]:
    """
    Yield AssessmentEvent-shaped dicts (kind + payload). No LLM call; demo emits assessed result.
    Each event matches the AssessmentEvent TypeScript union (event type = kind, data = full object).
    """
    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    audit_fabric.log("assessment_run_start", entity_type="assessment_run", entity_id=run_id, payload={"organization_id": organization_id, "framework_ids": [f.value for f in framework_ids]})

    yield {
        "kind": "run_start",
        "runId": run_id,
        "organizationId": organization_id,
        "frameworkIds": [f.value for f in framework_ids],
        "startedAt": started_at,
    }

    for fid in framework_ids:
        fw = get(fid)
        if fw is None:
            continue

        yield {
            "kind": "framework_start",
            "frameworkId": fid.value,
            "frameworkName": fw.name,
        }

        for control in fw.controls:
            ctx = await get_context_for_control(session, organization_id, control)
            if ctx is None:
                yield {"kind": "error", "controlId": control.id, "message": "Organization not found"}
                continue

            yield {
                "kind": "control_context",
                "frameworkId": fid.value,
                "controlId": control.id,
                "context": ctx,
            }

            # Demo: no LLM; emit control_result. Real run would call CircuitBreaker-wrapped LLM.
            yield {
                "kind": "control_result",
                "frameworkId": fid.value,
                "controlId": control.id,
                "controlName": control.name,
                "status": "assessed",
                "finding": f"Demo assessment for {control.name} (org={organization_id}). Context built.",
            }

        yield {"kind": "framework_done", "frameworkId": fid.value}

    finished_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    audit_fabric.log("assessment_run_done", entity_type="assessment_run", entity_id=run_id, payload={"finished_at": finished_at})
    yield {"kind": "run_done", "runId": run_id, "finishedAt": finished_at}
