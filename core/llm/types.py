# core/llm/types.py — Provider-agnostic LLM request/response types.

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class LLMMessage:
    role: str  # system | user | assistant
    content: str


@dataclass(frozen=True)
class StructuredCompletionRequest:
    """JSON-shaped completion; providers map this to their native API."""

    system: str
    user: str
    response_schema_name: str = "cortex_structured_response"
    max_tokens: int = 4096
    temperature: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class StructuredCompletionResult:
    provider_id: str
    model: str
    raw_text: str
    usage: dict[str, int] = field(default_factory=dict)
