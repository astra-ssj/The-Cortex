# services/assessment_llm.py — Per-control assessment via multi-provider LLM (assessment_llm CircuitBreaker).

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog
from compliance.models import Control
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit_fabric import append_audit_log, audit_fabric
from core.circuit_breaker import get_assessment_breaker
from core.human_review import enqueue_assessment_human_review
from core.llm import StructuredCompletionRequest, complete_structured
from core.llm.assessment_prompt import build_assessment_request
from core.llm.assessment_schema import AssessmentLLMOutput
from core.llm.config import assessment_llm_enabled

logger = structlog.get_logger()

CONFIDENCE_THRESHOLD = 0.75
_assessment_breaker = get_assessment_breaker()


def _demo_control_result(
    *,
    framework_id: str,
    control: Control,
    organization_id: str,
    reason: str,
) -> dict[str, Any]:
    return {
        "kind": "control_result",
        "frameworkId": framework_id,
        "controlId": control.id,
        "controlName": control.name,
        "status": "assessed",
        "finding": f"Demo assessment for {control.name} (org={organization_id}). {reason}",
        "confidence": 0.85,
        "llm_provider": "demo",
    }


def _reference_for_control(control: Control) -> str:
    for req in control.requirements:
        if req.article_ref:
            return str(req.article_ref)[:500]
    return control.domain or control.id


async def _call_llm(
    *,
    org_id: str,
    run_id: str,
    framework_id: str,
    framework_name: str,
    control: Control,
    context: dict[str, Any],
) -> dict[str, Any]:
    system, user = build_assessment_request(
        framework_id=framework_id,
        framework_name=framework_name,
        control_id=control.id,
        control_name=control.name,
        context=context,
    )
    request = StructuredCompletionRequest(
        system=system,
        user=user,
        response_schema_name="control_assessment",
        metadata={
            "framework_id": framework_id,
            "control_id": control.id,
            "run_id": run_id,
        },
    )

    async def _invoke() -> dict[str, Any]:
        completion = await complete_structured(request, AssessmentLLMOutput)
        audit_fabric.log(
            "assessment_llm_response",
            entity_type="llm",
            entity_id=completion.provider_id,
            payload={
                "provider": completion.provider_id,
                "model": completion.model,
                "control_id": control.id,
                "framework_id": framework_id,
                "usage": completion.usage,
            },
        )
        out = AssessmentLLMOutput.model_validate_json(completion.raw_text)
        return {
            "kind": "control_result",
            "frameworkId": framework_id,
            "controlId": control.id,
            "controlName": control.name,
            "status": "assessed",
            "finding": out.finding,
            "compliance_status": out.compliance_status,
            "confidence": out.confidence_score,
            "llm_provider": completion.provider_id,
            "severity": out.severity,
            "reference": out.reference or _reference_for_control(control),
        }

    return await _invoke()


async def assess_control_with_llm(
    session: AsyncSession,
    *,
    org_id: str,
    run_id: str,
    framework_id: str,
    framework_name: str,
    control: Control,
    context: dict[str, Any],
) -> dict[str, Any]:
    """
    Assess one control via LLM (CircuitBreaker). Enqueues human review when confidence < 0.75.
    Falls back to demo finding on LLM failure.
    """
    if not assessment_llm_enabled():
        return _demo_control_result(
            framework_id=framework_id,
            control=control,
            organization_id=org_id,
            reason="CORTEX_ASSESSMENT_LLM_ENABLED=0",
        )

    audit_fabric.log(
        "assessment_llm_request",
        entity_type="assessment_run",
        entity_id=run_id,
        payload={
            "org_id": org_id,
            "framework_id": framework_id,
            "control_id": control.id,
        },
    )

    try:
        result = await _assessment_breaker.execute(
            _call_llm,
            org_id=org_id,
            run_id=run_id,
            framework_id=framework_id,
            framework_name=framework_name,
            control=control,
            context=context,
        )
    except Exception as e:
        logger.warning(
            "assessment_llm_failed",
            control_id=control.id,
            framework_id=framework_id,
            error=str(e),
        )
        audit_fabric.log(
            "assessment_llm_error",
            entity_type="assessment_run",
            entity_id=run_id,
            payload={"control_id": control.id, "error": str(e)},
        )
        return _demo_control_result(
            framework_id=framework_id,
            control=control,
            organization_id=org_id,
            reason=f"LLM unavailable: {e}",
        )

    confidence = float(result.get("confidence") or 0.0)
    if confidence < CONFIDENCE_THRESHOLD:
        item_id = f"assess-{run_id[:8]}-{control.id}"[:120]
        assessment_label = str(result.get("compliance_status") or "unknown").upper().replace("_", " ")
        await enqueue_assessment_human_review(
            session,
            org_id=org_id,
            item_id=item_id,
            framework=framework_name,
            control_id=control.id,
            name=control.name,
            assessment=assessment_label,
            confidence=confidence,
            severity=str(result.get("severity") or "MEDIUM"),
            reference=str(result.get("reference") or _reference_for_control(control)),
        )
        await append_audit_log(
            session,
            event_type="assessment_human_review_enqueued",
            entity_type="human_review",
            entity_id=item_id,
            payload={
                "org_id": org_id,
                "control_id": control.id,
                "confidence": confidence,
            },
        )

    return result
