# core/llm/router.py — Ordered provider chain with fallback (CircuitBreaker wraps callers).

from __future__ import annotations

from typing import Any

import structlog
from pydantic import BaseModel

from core.llm.config import llm_provider_chain
from core.llm.providers.base import LLMProvider
from core.llm.registry import all_providers, get_provider
from core.llm.types import StructuredCompletionRequest, StructuredCompletionResult

logger = structlog.get_logger()


def resolve_provider_chain() -> list[LLMProvider]:
    """Instantiate providers from CORTEX_LLM_PROVIDERS (configured entries only, then stub)."""
    chain_ids = llm_provider_chain()
    resolved: list[LLMProvider] = []
    seen: set[str] = set()
    for pid in chain_ids:
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
) -> StructuredCompletionResult:
    """
    Try providers in env order (default: anthropic → openai → stub).
    Raises the last error if every configured provider fails.
    """
    providers = resolve_provider_chain()
    if not providers:
        raise RuntimeError("No LLM providers available")

    last_error: Exception | None = None
    for provider in providers:
        try:
            result = await provider.complete_structured(request, response_model)
            if provider.provider_id != "stub":
                logger.info(
                    "llm_completion_ok",
                    provider=provider.provider_id,
                    model=result.model,
                    usage=result.usage,
                )
            return result
        except Exception as e:
            last_error = e
            logger.warning(
                "llm_provider_failed",
                provider=provider.provider_id,
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
