# tests/test_model_provider.py — Provider selection and Ollama path (HTTP mocked).

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from core.agents.harness import AgentResponse
from core.agents.model import (
    _DEFAULT_OLLAMA_BASE_URL,
    _DEFAULT_OLLAMA_MODEL,
    _strip_markdown_fences,
    call_model,
    resolve_agent_provider,
)


def _unset_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MODEL_PROVIDER", raising=False)


def test_unset_without_key_selects_stub(monkeypatch: pytest.MonkeyPatch) -> None:
    _unset_provider(monkeypatch)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    provider = resolve_agent_provider()
    assert provider.provider_id == "stub"


def test_unset_with_key_selects_anthropic(monkeypatch: pytest.MonkeyPatch) -> None:
    _unset_provider(monkeypatch)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-real")
    provider = resolve_agent_provider()
    assert provider.provider_id == "anthropic"


def test_explicit_stub_wins_over_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "stub")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-real")
    provider = resolve_agent_provider()
    assert provider.provider_id == "stub"


def test_explicit_anthropic_without_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        resolve_agent_provider()


def test_unknown_provider_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "not-a-vendor")
    with pytest.raises(RuntimeError, match="Unknown MODEL_PROVIDER"):
        resolve_agent_provider()


def test_strip_markdown_fences_shared() -> None:
    fenced = '```json\n{"speaker": "X", "stance": "calm"}\n```'
    assert _strip_markdown_fences(fenced) == '{"speaker": "X", "stance": "calm"}'


class _FakeResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


def _patch_async_client(
    monkeypatch: pytest.MonkeyPatch,
    *,
    payload: dict[str, Any] | None = None,
    error: Exception | None = None,
) -> dict[str, Any]:
    captured: dict[str, Any] = {}

    class _FakeClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            captured["timeout"] = kwargs.get("timeout")

        async def __aenter__(self) -> _FakeClient:
            return self

        async def __aexit__(self, *args: Any) -> None:
            return None

        async def post(self, url: str, json: dict[str, Any] | None = None) -> _FakeResponse:
            captured["url"] = url
            captured["json"] = json
            if error is not None:
                raise error
            assert payload is not None
            return _FakeResponse(payload)

    monkeypatch.setattr("core.agents.model.httpx.AsyncClient", _FakeClient)
    return captured


def _valid_agent_json() -> str:
    return json.dumps(
        {
            "speaker": "Account Manager",
            "stance": "cooperative",
            "message": "We are containing the incident with your SOC.",
            "demands": ["Joint customer statement"],
        }
    )


@pytest.mark.asyncio
async def test_ollama_posts_openai_compatible_body(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "ollama")
    monkeypatch.delenv("AGENT_MODEL", raising=False)
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
    captured = _patch_async_client(
        monkeypatch,
        payload={"choices": [{"message": {"content": _valid_agent_json()}}]},
    )

    raw = await call_model("You are the Account Manager.", {"stage": "brief"})

    assert captured["timeout"] == 120.0
    assert captured["url"] == f"{_DEFAULT_OLLAMA_BASE_URL}/v1/chat/completions"
    body = captured["json"]
    assert body["model"] == _DEFAULT_OLLAMA_MODEL
    assert body["temperature"] == 0.3
    assert body["max_tokens"] == 1000
    assert [m["role"] for m in body["messages"]] == ["system", "user"]
    assert body["messages"][0]["content"] == "You are the Account Manager."
    parsed = AgentResponse.model_validate(json.loads(raw))
    assert parsed.speaker == "Account Manager"


@pytest.mark.asyncio
async def test_ollama_connection_refused_does_not_stub(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "ollama")
    req = httpx.Request("POST", f"{_DEFAULT_OLLAMA_BASE_URL}/v1/chat/completions")
    _patch_async_client(
        monkeypatch,
        error=httpx.ConnectError("Connection refused", request=req),
    )

    with pytest.raises(RuntimeError, match="OLLAMA_BASE_URL") as excinfo:
        await call_model("role", {"stage": "brief"})

    message = str(excinfo.value)
    assert "ollama serve" in message
    assert _DEFAULT_OLLAMA_BASE_URL in message
    assert "DevOps Lead" not in message


@pytest.mark.asyncio
async def test_ollama_fenced_json_strips_and_validates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "ollama")
    inner = _valid_agent_json()
    fenced = f"```json\n{inner}\n```"
    _patch_async_client(
        monkeypatch,
        payload={"choices": [{"message": {"content": fenced}}]},
    )

    raw = await call_model("You are the Account Manager.", {"stage": "brief"})
    assert not raw.lstrip().startswith("```")
    parsed = AgentResponse.model_validate(json.loads(raw))
    assert parsed.speaker == "Account Manager"
    assert parsed.demands == ["Joint customer statement"]
