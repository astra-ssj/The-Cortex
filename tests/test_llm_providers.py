# tests/test_llm_providers.py — Multi-provider LLM gateway.

from __future__ import annotations

import pytest
from pydantic import BaseModel

from core.llm.config import llm_provider_chain
from core.llm.mapping_schema import OntologyMappingLLMOutput
from core.llm.registry import get_provider
from core.llm.router import complete_structured, llm_platform_status, resolve_provider_chain
from core.llm.types import StructuredCompletionRequest


class _SampleOut(BaseModel):
    answer: str


@pytest.mark.asyncio
async def test_stub_provider_structured_completion() -> None:
    stub = get_provider("stub")
    assert stub is not None
    req = StructuredCompletionRequest(
        system="test",
        user="test",
        metadata={"stub_json": {"answer": "ok"}},
    )
    result = await stub.complete_structured(req, _SampleOut)
    assert result.provider_id == "stub"
    parsed = _SampleOut.model_validate_json(result.raw_text)
    assert parsed.answer == "ok"


@pytest.mark.asyncio
async def test_router_uses_stub_when_only_stub_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORTEX_LLM_PROVIDERS", "anthropic,stub")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    chain = resolve_provider_chain()
    assert any(p.provider_id == "stub" for p in chain)
    req = StructuredCompletionRequest(system="s", user="u")
    out = await complete_structured(req, OntologyMappingLLMOutput)
    assert out.provider_id == "stub"
    body = OntologyMappingLLMOutput.model_validate_json(out.raw_text)
    assert body.confidence_score >= 0


def test_llm_platform_status_shape() -> None:
    status = llm_platform_status()
    assert "chain" in status
    assert "active_chain" in status
    assert "providers" in status
    assert "anthropic" in status["providers"]
    assert "openai" in status["providers"]
    assert "stub" in status["providers"]


def test_default_chain_prefers_anthropic() -> None:
    monkeypatch = pytest.MonkeyPatch()
    try:
        monkeypatch.delenv("CORTEX_LLM_PROVIDERS", raising=False)
        monkeypatch.delenv("CORTEX_LLM_PROVIDER", raising=False)
        chain = llm_provider_chain()
        assert chain[0] == "anthropic"
    finally:
        monkeypatch.undo()
