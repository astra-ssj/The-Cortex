# core/agents/scenario.py — Deterministic Learning Loop scenario controller helpers.
#
# The API advances the loop; the agent is consulted via the harness and never free-writes state.

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from core.agents.harness import DEVOPS_LEAD_ROLE, AgentResponse, call_agent

SCENARIO_ID = "cloud_access_onboarding"

SCENARIO_BRIEF = (
    "You are the security reviewer for a Friday production cutover. The DevOps Lead is "
    "asking for broad cloud access (prod admin, staging, shared CI). Choose how to respond — "
    "your decision drives risk and the next agent turn."
)

CHOICE_LABELS: dict[str, str] = {
    "approve_all": "Approve all requested access",
    "least_privilege": "Grant least privilege only",
    "challenge": "Challenge — demand justification",
    "deny": "Deny the request",
}

_AVAILABLE_CHOICES = [
    {"id": k, "label": v} for k, v in CHOICE_LABELS.items()
]


def initial_state(*, opening: AgentResponse) -> dict[str, Any]:
    return {
        "brief": SCENARIO_BRIEF,
        "messages": [
            {
                "speaker": opening.speaker,
                "stance": opening.stance,
                "message": opening.message,
                "demands": list(opening.demands),
            }
        ],
        "choices": list(_AVAILABLE_CHOICES),
        "decisions": [],
        "last_harness": opening.model_dump(),
        "scenario_id": SCENARIO_ID,
    }


def risk_for_choice(choice: str) -> str:
    """Deterministic risk mapping — controller owns risk, not the agent."""
    if choice == "approve_all":
        return "over-provisioned"
    if choice == "least_privilege":
        return "controlled"
    if choice == "deny":
        return "blocked"
    if choice == "challenge":
        return "under_review"
    return "unknown"


def stage_after_choice(choice: str, prior_stage: str) -> str:
    if choice == "approve_all":
        return "complete"
    if choice == "deny":
        return "complete"
    if choice == "least_privilege":
        return "complete"
    if choice == "challenge":
        return "escalation"
    return prior_stage or "access_request"


def choices_for_stage(stage: str) -> list[dict[str, str]]:
    if stage == "complete":
        return []
    if stage == "escalation":
        return [
            {"id": "approve_all", "label": CHOICE_LABELS["approve_all"]},
            {"id": "least_privilege", "label": CHOICE_LABELS["least_privilege"]},
            {"id": "deny", "label": CHOICE_LABELS["deny"]},
        ]
    return list(_AVAILABLE_CHOICES)


async def open_session_agent_turn(session_row: dict[str, Any]) -> AgentResponse:
    return await call_agent(
        DEVOPS_LEAD_ROLE,
        SCENARIO_BRIEF,
        session_row,
    )


async def advance_after_decision(
    *,
    session_row: dict[str, Any],
    choice: str,
) -> tuple[dict[str, Any], str, str, AgentResponse]:
    """
    Apply learner choice, consult agent, compute risk/stage.

    Returns (new_state, new_stage, new_risk, harness_result).
    Never writes malformed harness data — AgentResponse is always valid.
    """
    state = dict(session_row.get("state") or {})
    messages = list(state.get("messages") or [])
    decisions = list(state.get("decisions") or [])
    now = datetime.now(timezone.utc).isoformat()
    decisions.append({"choice": choice, "at": now})

    risk = risk_for_choice(choice)
    stage = stage_after_choice(choice, str(session_row.get("stage") or "access_request"))

    interim = {
        **session_row,
        "stage": stage,
        "risk": risk,
        "state": {
            **state,
            "decisions": decisions,
            "messages": messages,
        },
    }
    agent = await call_agent(
        DEVOPS_LEAD_ROLE,
        f"Learner chose '{choice}'. Risk is now '{risk}'. Respond in character.",
        interim,
    )
    messages.append(
        {
            "speaker": agent.speaker,
            "stance": agent.stance,
            "message": agent.message,
            "demands": list(agent.demands),
        }
    )
    new_state: dict[str, Any] = {
        **state,
        "brief": state.get("brief") or SCENARIO_BRIEF,
        "messages": messages,
        "choices": choices_for_stage(stage),
        "decisions": decisions,
        "last_harness": agent.model_dump(),
        "scenario_id": SCENARIO_ID,
    }
    return new_state, stage, risk, agent
