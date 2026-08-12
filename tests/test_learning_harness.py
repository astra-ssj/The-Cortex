# tests/test_learning_harness.py — Harness schema validation without DB.

from __future__ import annotations

import pytest

from core.agents.harness import AgentResponse, call_agent
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
