# core/llm/registry.py — Register and resolve LLM providers by id.

from __future__ import annotations

from core.llm.providers.anthropic import AnthropicLLMProvider
from core.llm.providers.base import LLMProvider
from core.llm.providers.openai import OpenAILLMProvider
from core.llm.providers.stub import StubLLMProvider

_PROVIDERS: dict[str, LLMProvider] = {
    "anthropic": AnthropicLLMProvider(),
    "openai": OpenAILLMProvider(),
    "stub": StubLLMProvider(),
}


def get_provider(provider_id: str) -> LLMProvider | None:
    return _PROVIDERS.get(provider_id.strip().lower())


def all_providers() -> dict[str, LLMProvider]:
    return dict(_PROVIDERS)


def registered_provider_ids() -> list[str]:
    return sorted(_PROVIDERS.keys())
