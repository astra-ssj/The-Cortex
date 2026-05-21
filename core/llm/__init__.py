# core/llm — Multi-provider LLM gateway (Anthropic, OpenAI, stub).

from core.llm.router import complete_structured, llm_platform_status, resolve_provider_chain
from core.llm.types import StructuredCompletionRequest, StructuredCompletionResult

__all__ = [
    "StructuredCompletionRequest",
    "StructuredCompletionResult",
    "complete_structured",
    "llm_platform_status",
    "resolve_provider_chain",
]
