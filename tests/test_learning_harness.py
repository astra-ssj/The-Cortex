# tests/test_learning_harness.py — Harness schema validation without DB.

from __future__ import annotations

import json

import pytest

from core.agents.harness import (
    _FALLBACK,
    _MAX_DEMANDS,
    _MAX_HISTORY_TURNS,
    _MAX_MESSAGE_CHARS,
    AgentResponse,
    call_agent,
)
from core.agents.scenario import risk_for_choice


@pytest.mark.asyncio
async def test_call_agent_returns_valid_agent_response() -> None:
    out = await call_agent(
        "devops_lead",
        "Need access for cutover",
        {"stage": "access_request", "state": {"decisions": []}, "scenario": "cloud_access_onboarding"},
    )
    assert isinstance(out, AgentResponse)
    assert out.speaker
    assert out.message
    assert isinstance(out.demands, list)


@pytest.mark.asyncio
async def test_call_agent_fallback_on_bad_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CORTEX_LEARNING_FORCE_BAD_OUTPUT", "1")
    out = await call_agent(
        "devops_lead",
        "broken",
        {
            "stage": "access_request",
            "state": {"decisions": [{"choice": "approve_all"}]},
            "scenario": "cloud_access_onboarding",
        },
    )
    assert out.speaker == "DevOps Lead"
    assert "NOT_JSON" not in out.message
    assert out.demands


def test_approve_all_risk_mapping() -> None:
    assert risk_for_choice("approve_all") == "over-provisioned"


@pytest.mark.asyncio
async def test_oversized_model_output_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    """An unbounded turn must not reach persisted state — state is replayed into prompts."""
    flood = json.dumps(
        {
            "speaker": "DevOps Lead",
            "stance": "urgent",
            "message": "A" * (_MAX_MESSAGE_CHARS + 1),
            "demands": ["ship it"],
        }
    )

    async def _flood(role_prompt: str, context: dict[str, object]) -> str:
        return flood

    monkeypatch.setattr("core.agents.harness.call_model", _flood)
    out = await call_agent("devops_lead", "flood", {"stage": "access_request", "state": {}})
    assert len(out.message) <= _MAX_MESSAGE_CHARS
    assert out.message == _FALLBACK["message"]


@pytest.mark.asyncio
async def test_too_many_demands_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _many(role_prompt: str, context: dict[str, object]) -> str:
        return json.dumps(
            {
                "speaker": "DevOps Lead",
                "stance": "urgent",
                "message": "Grant everything.",
                "demands": [f"demand-{i}" for i in range(_MAX_DEMANDS + 1)],
            }
        )

    monkeypatch.setattr("core.agents.harness.call_model", _many)
    out = await call_agent("devops_lead", "many", {"stage": "access_request", "state": {}})
    assert out.message == _FALLBACK["message"]


@pytest.mark.asyncio
async def test_prompt_history_is_capped(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replayed history is bounded, so prompt size does not grow with session length."""
    seen: dict[str, object] = {}

    async def _capture(role_prompt: str, context: dict[str, object]) -> str:
        seen.update(context)
        return json.dumps(
            {"speaker": "DevOps Lead", "stance": "neutral", "message": "ok", "demands": []}
        )

    monkeypatch.setattr("core.agents.harness.call_model", _capture)
    history = [{"speaker": "DevOps Lead", "message": f"turn-{i}"} for i in range(_MAX_HISTORY_TURNS * 3)]
    await call_agent(
        "devops_lead",
        "long session",
        {"stage": "escalation", "state": {"messages": history, "decisions": []}},
    )

    sent = seen["messages"]
    assert isinstance(sent, list)
    assert len(sent) == _MAX_HISTORY_TURNS
    # Kept the most recent turns, not the oldest.
    assert sent[-1]["message"] == f"turn-{len(history) - 1}"
