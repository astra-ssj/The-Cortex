# core/agents/model.py — Single swappable model-call primitive for Learning Loop agents.
#
# Signature is final: Claude is the live path; stub remains for tests and when
# ANTHROPIC_API_KEY is unset. Model id comes from AGENT_MODEL env, never hard-coded.

from __future__ import annotations

import json
import os
from typing import Any

import anthropic
import structlog

from core.circuit_breaker import CircuitBreaker, register_circuit_breaker

logger = structlog.get_logger()

# Module-level breaker — .cursorrules: never instantiate inside functions.
_agent_model_breaker = CircuitBreaker("learning_agent_model", failure_threshold=5)
register_circuit_breaker(_agent_model_breaker)

# Test hook: when set, call_model returns deliberately invalid JSON so harness
# fallback paths can be proven without a live provider.
_FORCE_BAD_OUTPUT_ENV = "CORTEX_LEARNING_FORCE_BAD_OUTPUT"

_STUB_MODEL_NAME = "stub-devops-lead-v1"
_DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 1000


def agent_model_name() -> str:
    """Configured model id (env: AGENT_MODEL). Stub ignores the value today."""
    return os.getenv("AGENT_MODEL", "stub-devops-lead-v1")


async def call_model(role_prompt: str, context: dict[str, Any]) -> str:
    """
    Invoke the configured agent model and return raw text.

    Live Claude is used when AGENT_MODEL is not the stub id and ANTHROPIC_API_KEY
    is set. Otherwise the deterministic stub runs. Both paths go through
    `_agent_model_breaker.execute(...)`.
    """
    model = agent_model_name()
    api_key_present = bool(os.getenv("ANTHROPIC_API_KEY"))
    use_stub = model == _STUB_MODEL_NAME or not api_key_present
    path = "stub" if use_stub else "claude"
    logger.info(
        "learning_call_model",
        model=model,
        path=path,
        api_key_present=api_key_present,
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

    if use_stub:
        return await _agent_model_breaker.execute(_stub_invoke)

    async def _claude_invoke() -> str:
        client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )
        user_content = (
            f"Context:\n{json.dumps(context, indent=2)}\n\n"
            "Respond ONLY as JSON with keys: "
            "speaker, stance, message, demands. "
            "No preamble, no markdown, no explanation."
        )
        response = await client.messages.create(
            model=os.getenv("AGENT_MODEL", _DEFAULT_CLAUDE_MODEL),
            max_tokens=_MAX_TOKENS,
            system=role_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        # Models often wrap JSON in markdown fences; the harness json.loads the
        # raw string and rejects a leading ``` as schema_invalid.
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return raw.strip()

    return await _agent_model_breaker.execute(_claude_invoke)
