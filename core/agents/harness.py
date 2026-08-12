# core/agents/harness.py — Skill harness: schema-validate agent output before it touches state.
#
# The controller consults the agent through this harness only. Malformed model
# output never enters scenario_sessions.state — we return a safe fallback and log.

from __future__ import annotations

import json
from typing import Any

import structlog
from pydantic import BaseModel, Field, ValidationError

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


class AgentResponse(BaseModel):
    """Validated agent turn — harness refuses anything outside this schema."""

    speaker: str = Field(..., min_length=1)
    stance: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    demands: list[str] = Field(default_factory=list)


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
    role_key = (role or DEVOPS_LEAD_ROLE).strip() or DEVOPS_LEAD_ROLE
    role_prompt = _ROLE_PROMPTS.get(role_key, _ROLE_PROMPTS[DEVOPS_LEAD_ROLE])

    state = session.get("state") if isinstance(session.get("state"), dict) else {}
    decisions = state.get("decisions") if isinstance(state.get("decisions"), list) else []
    last_choice = ""
    if decisions:
        last = decisions[-1]
        if isinstance(last, dict):
            last_choice = str(last.get("choice") or "")

    context: dict[str, Any] = {
        "situation": situation,
        "stage": session.get("stage") or state.get("stage") or "brief",
        "risk": session.get("risk"),
        "last_choice": last_choice,
        "decision_count": len(decisions),
        "scenario": session.get("scenario"),
        "messages": state.get("messages") if isinstance(state.get("messages"), list) else [],
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
