# core/agents/harness.py — Skill harness: schema-validate agent output before it touches state.
#
# The controller consults the agent through this harness only. Malformed model
# output never enters scenario_sessions.state — we return a safe fallback and log.

from __future__ import annotations

import json
from typing import Annotated, Any

import structlog
from pydantic import BaseModel, Field, StringConstraints, ValidationError

from core.agents.model import call_model

logger = structlog.get_logger()

# One agent role for Learning Loop v1.
DEVOPS_LEAD_ROLE = "devops_lead"

_ROLE_PROMPTS: dict[str, str] = {
    DEVOPS_LEAD_ROLE: (
        "You are the DevOps Lead in a CORTEX learning scenario. Speak in first person. "
        "Press for delivery speed while staying professionally plausible. "
        "Respond ONLY as JSON with keys: speaker, stance, message, demands."
    ),
    "supplier_incident_response": (
        "You are the Account Manager at a SaaS HR platform "
        "that has just suffered a security breach affecting a "
        "customer's employee data. Speak in first person. "
        "You are cooperative but managing reputational risk. "
        "Press for a contained, agreed response that protects "
        "both parties. Respond ONLY as JSON with keys: "
        "speaker, stance, message, demands."
    ),
    "change_management_failure": (
        "You are an Engineering Lead who pushed an emergency "
        "patch to production without CAB approval, causing an "
        "outage. Speak in first person. You believe the patch "
        "was the right call given the CVSS score. You are "
        "defensive about the process bypass but cooperative "
        "on the technical timeline. Respond ONLY as JSON "
        "with keys: speaker, stance, message, demands."
    ),
    "asset_classification_breach": (
        "You are a Junior Security Analyst who discovered "
        "sensitive data on an unclassified shared drive three "
        "days before a surveillance audit. Speak in first "
        "person. You are anxious and deferring to the "
        "security lead for every decision. Respond ONLY as "
        "JSON with keys: speaker, stance, message, demands."
    ),
    "ransomware_group_response": (
        "You are the Group SOC Lead managing a ransomware "
        "incident affecting the largest subsidiary. Speak in "
        "first person. You have confirmed technical facts but "
        "need the CISO's decision authority on containment, "
        "ransom, and notification. You are calm and precise "
        "under pressure. Respond ONLY as JSON with keys: "
        "speaker, stance, message, demands."
    ),
}

_FALLBACK = {
    "speaker": "DevOps Lead",
    "stance": "neutral",
    "message": (
        "I need a moment to rephrase — please treat the prior access ask as still open "
        "and choose least privilege, challenge, approve, or deny."
    ),
    "demands": ["Re-confirm access decision"],
}


# Upper bounds on a single agent turn. Model output is persisted into
# scenario_sessions.state and replayed into the next prompt, so an unbounded turn
# grows the row and the context window on every decision. Generous enough that a
# well-behaved turn is never refused.
_MAX_SPEAKER_CHARS = 120
_MAX_STANCE_CHARS = 60
_MAX_MESSAGE_CHARS = 4000
_MAX_DEMANDS = 10
_MAX_DEMAND_CHARS = 240

# How many prior turns are replayed to the model. Caps prompt growth over a long
# session and limits how far earlier model output can carry an injected instruction.
_MAX_HISTORY_TURNS = 12


class AgentResponse(BaseModel):
    """Validated agent turn — harness refuses anything outside this schema."""

    speaker: str = Field(..., min_length=1, max_length=_MAX_SPEAKER_CHARS)
    stance: str = Field(..., min_length=1, max_length=_MAX_STANCE_CHARS)
    message: str = Field(..., min_length=1, max_length=_MAX_MESSAGE_CHARS)
    demands: list[Annotated[str, StringConstraints(max_length=_MAX_DEMAND_CHARS)]] = Field(
        default_factory=list,
        max_length=_MAX_DEMANDS,
    )


def _safe_fallback(*, reason: str) -> AgentResponse:
    logger.warning("learning_harness_fallback", reason=reason)
    return AgentResponse.model_validate(_FALLBACK)


async def call_agent(
    role: str,
    situation: str,
    session: dict[str, Any],
) -> AgentResponse:
    """
    Build context from session state, call the model, validate into AgentResponse.

    On any parse/validation failure returns a safe fallback and never raises —
    callers must not write malformed payloads into persisted state.
    """
    state = session.get("state") if isinstance(session.get("state"), dict) else {}
    role_key = (
        session.get("scenario")
        or state.get("scenario_id")
        or (role or DEVOPS_LEAD_ROLE).strip()
        or DEVOPS_LEAD_ROLE
    )
    role_prompt = _ROLE_PROMPTS.get(role_key, _ROLE_PROMPTS[DEVOPS_LEAD_ROLE])
    decisions = state.get("decisions") if isinstance(state.get("decisions"), list) else []
    last_choice = ""
    if decisions:
        last = decisions[-1]
        if isinstance(last, dict):
            last_choice = str(last.get("choice") or "")

    history = state.get("messages") if isinstance(state.get("messages"), list) else []

    context: dict[str, Any] = {
        "situation": situation,
        "stage": session.get("stage") or state.get("stage") or "brief",
        "risk": session.get("risk"),
        "last_choice": last_choice,
        "decision_count": len(decisions),
        "scenario": session.get("scenario"),
        "messages": history[-_MAX_HISTORY_TURNS:],
    }

    try:
        raw = await call_model(role_prompt, context)
    except Exception as e:
        logger.warning("learning_harness_model_error", error=str(e))
        return _safe_fallback(reason=f"model_error:{e}")

    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        if not isinstance(data, dict):
            return _safe_fallback(reason="non_object_json")
        return AgentResponse.model_validate(data)
    except (json.JSONDecodeError, TypeError, ValidationError) as e:
        return _safe_fallback(reason=f"schema_invalid:{e}")
