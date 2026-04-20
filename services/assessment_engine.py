# services/assessment_engine.py — Assessment run: yields AssessmentEvent-shaped events for SSE.

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from compliance import FrameworkId, get

from core.audit_fabric import audit_fabric
from services.context_builder import get_context_for_control, get_org_profile
from services.posture_calculator import PostureCalculator

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

    org = await get_org_profile(session, organization_id)
    org_meta = org.metadata_ if org and getattr(org, "metadata_", None) else {}
    org_context = {
        "maturity_score": float(org_meta.get("maturity_score", 0.42)),
        "industry": getattr(org, "industry", None) or "technology",
        "employee_count": org_meta.get("employees", 500),
        "existing_controls": [],
    }
    calculator = PostureCalculator()

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
            skill = None
            try:
                from app.core.skills_loader import get_skill_for_framework

                skill = get_skill_for_framework(fid.value)
            except Exception as e:
                logger.warning("skill_lookup_failed", framework_id=fid.value, error=str(e))

            result: dict[str, Any] = {
                "kind": "control_result",
                "frameworkId": fid.value,
                "controlId": control.id,
                "controlName": control.name,
                "status": "assessed",
                "finding": f"Demo assessment for {control.name} (org={organization_id}). Context built.",
            }
            if skill:
                result["skill_id"] = skill.id
                result["skill_name"] = skill.name
                result["citation_format"] = skill.get_citation_format()
                logger.info(
                    "ztaip_skill_matched",
                    control_id=control.id,
                    skill_id=skill.id,
                    framework_id=fid.value,
                )
            else:
                result["skill_id"] = None
                logger.info(
                    "ztaip_skill_unmatched",
                    control_id=control.id,
                    framework_id=fid.value,
                )
            yield result

        posture = calculator.calculate_framework_posture(fid.value, org_context)
        await calculator.save_assessment_result(
            session, organization_id, fid.value, float(posture["score"]), posture["gap_count"]
        )
        yield {"kind": "framework_done", "frameworkId": fid.value}

    finished_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    audit_fabric.log("assessment_run_done", entity_type="assessment_run", entity_id=run_id, payload={"finished_at": finished_at})
    yield {"kind": "run_done", "runId": run_id, "finishedAt": finished_at}
