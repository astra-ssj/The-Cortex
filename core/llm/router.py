# core/llm/router.py — Intelligent task routing and provider fallback chain.

from __future__ import annotations

from typing import Any, Optional

import structlog
from pydantic import BaseModel

from core.llm.config import llm_provider_chain
from core.llm.providers.base import LLMProvider
from core.llm.registry import all_providers, get_provider
from core.llm.types import StructuredCompletionRequest, StructuredCompletionResult

logger = structlog.get_logger()


def _infer_task_type(request: Optional[StructuredCompletionRequest], task: Optional[str] = None) -> str:
    """Infer task type from explicit parameter, request metadata, or schema name."""
    if task:
        return task.strip().lower()
    if request:
        if "task" in request.metadata:
            return str(request.metadata["task"]).strip().lower()
        schema_name = request.response_schema_name.lower()
        if "assessment" in schema_name or "grading" in schema_name:
            return "assessment"
        if "ontology" in schema_name or "mapping" in schema_name or "ingest" in schema_name:
            return "ingestion"
    return "general"


def resolve_provider_chain(
    task: Optional[str] = None,
    task_type: Optional[str] = None,
) -> list[LLMProvider]:
    """
    Instantiate providers from CORTEX_LLM_PROVIDERS (configured entries only, then stub).
    Applies intelligent routing based on task complexity:
    - 'assessment' / 'grading': prioritizes Gemini 4 Argon (thinking_level='high') if configured.
    - 'ingestion' / 'ontology_mapping': prioritizes Gemini 4 Argon (thinking_level='medium') for injection resistance.
    """
    configured_ids = llm_provider_chain()
    effective_task = (task or task_type or "").strip().lower()

    # Intelligent task routing adjustments
    ordered_ids: list[str] = []
    if effective_task in ("assessment", "grading", "cross_framework"):
        # High-complexity reasoning: prefer Gemini 4 Argon if available
        if "gemini" in configured_ids:
            ordered_ids.append("gemini")
    elif task_type in ("ingestion", "ontology_mapping"):
        # Document ingestion / prompt-injection defense: prefer Gemini 4 Argon
        if "gemini" in configured_ids:
            ordered_ids.append("gemini")

    for pid in configured_ids:
        if pid not in ordered_ids:
            ordered_ids.append(pid)

    resolved: list[LLMProvider] = []
    seen: set[str] = set()
    for pid in ordered_ids:
        if pid in seen:
            continue
        seen.add(pid)
        p = get_provider(pid)
        if p is None:
            logger.warning("llm_provider_unknown", provider_id=pid)
            continue
        if p.is_configured():
            resolved.append(p)

    stub = get_provider("stub")
    if stub and stub.is_configured() and all(p.provider_id != "stub" for p in resolved):
        resolved.append(stub)
    if not resolved and stub:
        resolved.append(stub)

    return resolved


async def complete_structured(
    request: StructuredCompletionRequest,
    response_model: type[BaseModel],
    task: Optional[str] = None,
) -> StructuredCompletionResult:
    """
    Try providers in task-routed order (e.g. gemini → anthropic → openai → stub).
    Automatically annotates request metadata with appropriate thinking_level if using Gemini.
    Raises the last error if every configured provider fails.
    """
    task_type = _infer_task_type(request, task)

    # Set intelligent thinking levels for Gemini if not explicitly provided
    mutable_metadata = dict(request.metadata)
    if "thinking_level" not in mutable_metadata:
        if task_type in ("assessment", "grading", "cross_framework"):
            mutable_metadata["thinking_level"] = "high"
        elif task_type in ("ingestion", "ontology_mapping"):
            mutable_metadata["thinking_level"] = "medium"
        else:
            mutable_metadata["thinking_level"] = "low"

    effective_request = StructuredCompletionRequest(
        system=request.system,
        user=request.user,
        response_schema_name=request.response_schema_name,
        max_tokens=request.max_tokens,
        temperature=request.temperature,
        metadata=mutable_metadata,
    )

    providers = resolve_provider_chain(task=task_type)
    if not providers:
        raise RuntimeError("No LLM providers available")

    last_error: Exception | None = None
    for provider in providers:
        try:
            result = await provider.complete_structured(effective_request, response_model)
            if provider.provider_id != "stub":
                logger.info(
                    "llm_completion_ok",
                    provider=provider.provider_id,
                    model=result.model,
                    task=task_type,
                    usage=result.usage,
                )
            return result
        except Exception as e:
            last_error = e
            logger.warning(
                "llm_provider_failed",
                provider=provider.provider_id,
                task=task_type,
                error=str(e),
            )

    raise RuntimeError(f"All LLM providers failed: {last_error}") from last_error


def llm_platform_status() -> dict[str, Any]:
    """Operator-facing status: chain order, which keys are set, per-provider models."""
    from core.llm.config import assessment_llm_enabled, assessment_max_controls_per_run

    chain_ids = llm_provider_chain()
    providers = all_providers()
    return {
        "chain": chain_ids,
        "active_chain": [p.provider_id for p in resolve_provider_chain()],
        "providers": {pid: providers[pid].status() for pid in sorted(providers.keys())},
        "assessment_llm_enabled": assessment_llm_enabled(),
        "assessment_max_controls_per_run": assessment_max_controls_per_run(),
    }
