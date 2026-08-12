# core/agents/model.py — Single swappable model-call primitive for Learning Loop agents.
#
# Signature is final: swap the stub body for Claude (then Kimi/GLM) without touching
# the harness or controller. Model id comes from AGENT_MODEL env, never hard-coded.

from __future__ import annotations

import json
import os
from typing import Any

import structlog

from core.circuit_breaker import CircuitBreaker, register_circuit_breaker

logger = structlog.get_logger()

# Module-level breaker — .cursorrules: never instantiate inside functions.
_agent_model_breaker = CircuitBreaker("learning_agent_model", failure_threshold=5)
register_circuit_breaker(_agent_model_breaker)

# Test hook: when set, call_model returns deliberately invalid JSON so harness
# fallback paths can be proven without a live provider.
_FORCE_BAD_OUTPUT_ENV = "CORTEX_LEARNING_FORCE_BAD_OUTPUT"


def agent_model_name() -> str:
    """Configured model id (env: AGENT_MODEL). Stub ignores the value today."""
    return os.getenv("AGENT_MODEL", "stub-devops-lead-v1")


async def call_model(role_prompt: str, context: dict[str, Any]) -> str:
    """
    Invoke the configured agent model and return raw text.

    TODO: Replace the stub body with the real client (Anthropic Claude first,
    then Kimi/GLM). Keep this the only place that talks to a provider — wrap
    the HTTP/SDK call in `_agent_model_breaker.execute(...)`. Model selection
    stays config-driven via AGENT_MODEL.
    """
    model = agent_model_name()
    logger.info(
        "learning_call_model",
        model=model,
        role_prompt_chars=len(role_prompt or ""),
        context_keys=sorted(context.keys()),
    )

    async def _stub_invoke() -> str:
        if os.getenv(_FORCE_BAD_OUTPUT_ENV, "").lower() in ("1", "true", "yes"):
            return "NOT_JSON{{{this is intentionally malformed"

        choice = str(context.get("last_choice") or "").strip()
        stage = str(context.get("stage") or "brief")
        situation = str(context.get("situation") or "")

        # Canned role-consistent DevOps Lead responses keyed by learner choice / stage.
        if choice == "approve_all":
            payload = {
                "speaker": "DevOps Lead",
                "stance": "relieved",
                "message": (
                    "Appreciate the green light — I'll provision admin on prod, staging, "
                    "and the shared CI runners so the team is unblocked by end of day."
                ),
                "demands": [
                    "Confirm admin on prod-cluster",
                    "Shared CI runner root keys",
                    "Skip ticket for the weekend cutover",
                ],
            }
        elif choice == "least_privilege":
            payload = {
                "speaker": "DevOps Lead",
                "stance": "pragmatic",
                "message": (
                    "Fair — scoped read on staging and break-glass for prod is workable. "
                    "I'll open a change ticket with the minimum roles."
                ),
                "demands": [
                    "Staging read role for the deploy bot",
                    "Time-boxed break-glass for prod",
                ],
            }
        elif choice == "deny":
            payload = {
                "speaker": "DevOps Lead",
                "stance": "frustrated",
                "message": (
                    "Understood — without access the release slips. I'll escalate to the "
                    "change board with the business impact noted."
                ),
                "demands": ["Escalation to change board", "Documented business impact"],
            }
        elif choice == "challenge":
            payload = {
                "speaker": "DevOps Lead",
                "stance": "defensive",
                "message": (
                    "Happy to walk through the blast radius. Here is the justification "
                    "packet — can we revisit after you review?"
                ),
                "demands": ["Review justification packet", "Follow-up within 24h"],
            }
        elif stage in ("brief", "access_request") and not choice:
            payload = {
                "speaker": "DevOps Lead",
                "stance": "urgent",
                "message": (
                    situation
                    or (
                        "We need broad cloud access for the onboarding cutover — prod admin, "
                        "staging, and shared CI. Can you approve so we ship tonight?"
                    )
                ),
                "demands": [
                    "Prod cluster admin",
                    "Staging full access",
                    "Shared CI runner credentials",
                ],
            }
        else:
            payload = {
                "speaker": "DevOps Lead",
                "stance": "neutral",
                "message": "Standing by for your decision on the access request.",
                "demands": ["Confirm or revise access scope"],
            }

        return json.dumps(payload)

    # Stub path still goes through the breaker so the real client swap keeps the same shape.
    return await _agent_model_breaker.execute(_stub_invoke)
