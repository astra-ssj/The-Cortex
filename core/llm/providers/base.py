# core/llm/providers/base.py — LLM provider protocol.

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel

from core.llm.types import StructuredCompletionRequest, StructuredCompletionResult


@runtime_checkable
class LLMProvider(Protocol):
    """Pluggable backend (Anthropic, OpenAI, stub, …)."""

    provider_id: str

    def is_configured(self) -> bool:
        """True when this provider can accept requests (e.g. API key present)."""
        ...

    async def complete_structured(
        self,
        request: StructuredCompletionRequest,
        response_model: type[BaseModel],
    ) -> StructuredCompletionResult:
        ...

    def status(self) -> dict[str, Any]:
        """Safe metadata for /system/llm-providers (no secrets)."""
        ...
