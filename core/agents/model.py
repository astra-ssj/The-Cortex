# core/agents/model.py — Single swappable model-call primitive for Learning Loop agents.
#
# Signature is final. Providers: anthropic (live), ollama (local), stub (tests).
# MODEL_PROVIDER selects explicitly; when unset, Anthropic is used if
# ANTHROPIC_API_KEY is set, otherwise stub. Model id comes from AGENT_MODEL.

from __future__ import annotations

import json
import os
from typing import Any, Protocol

import anthropic
import httpx
import structlog

from core.circuit_breaker import CircuitBreaker, CircuitState, register_circuit_breaker
from core.llm.config import llm_timeout_seconds

logger = structlog.get_logger()

# Module-level breaker — .cursorrules: never instantiate inside functions.
_agent_model_breaker = CircuitBreaker(
    "learning_agent_model",
    failure_threshold=5,
    # Anthropic 400s indicate an invalid request assembled by this caller, not
    # provider unavailability. Timeouts, transport errors, and 5xx still count.
    failure_predicate=lambda exc: not isinstance(exc, anthropic.BadRequestError),
)
register_circuit_breaker(_agent_model_breaker)

# Test hook: when set, call_model returns deliberately invalid JSON so harness
# fallback paths can be proven without a live provider.
_FORCE_BAD_OUTPUT_ENV = "CORTEX_LEARNING_FORCE_BAD_OUTPUT"

_STUB_MODEL_NAME = "stub-devops-lead-v1"
_DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6"
_DEFAULT_OLLAMA_MODEL = "gemma4:12b"
_DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
_MAX_TOKENS = 1000
_OLLAMA_TEMPERATURE = 0.3
_KNOWN_PROVIDERS = frozenset({"anthropic", "ollama", "stub"})


class _AgentProvider(Protocol):
    """Internal seam: one implementation per MODEL_PROVIDER value."""

    provider_id: str

    def model_name(self) -> str: ...

    def validate(self) -> None: ...

    async def invoke(self, role_prompt: str, context: dict[str, Any]) -> str: ...


def _strip_markdown_fences(raw: str) -> str:
    """Drop a leading ``` / ```json wrapper. Shared by Anthropic and Ollama."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


def _user_content(context: dict[str, Any]) -> str:
    return (
        f"Context:\n{json.dumps(context, indent=2)}\n\n"
        "Respond ONLY as JSON with keys: "
        "speaker, stance, message, demands. "
        "No preamble, no markdown, no explanation."
    )


def _ollama_base_url() -> str:
    return os.getenv("OLLAMA_BASE_URL", _DEFAULT_OLLAMA_BASE_URL).rstrip("/")


class _StubProvider:
    provider_id = "stub"

    def model_name(self) -> str:
        return os.getenv("AGENT_MODEL", _STUB_MODEL_NAME)

    def validate(self) -> None:
        return None

    async def invoke(self, role_prompt: str, context: dict[str, Any]) -> str:
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


class _AnthropicProvider:
    provider_id = "anthropic"

    def model_name(self) -> str:
        return os.getenv("AGENT_MODEL", _DEFAULT_CLAUDE_MODEL)

    def validate(self) -> None:
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise RuntimeError(
                "MODEL_PROVIDER=anthropic requires ANTHROPIC_API_KEY. "
                "Refusing to fall back to the stub."
            )

    async def invoke(self, role_prompt: str, context: dict[str, Any]) -> str:
        client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY"),
            timeout=llm_timeout_seconds(),
        )
        response = await client.messages.create(
            model=os.getenv("AGENT_MODEL", _DEFAULT_CLAUDE_MODEL),
            max_tokens=_MAX_TOKENS,
            # Role prompt is stable across stages in a session; cache it so
            # repeated turns pay cache-read rates instead of full input tokens.
            system=[
                {
                    "type": "text",
                    "text": role_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": _user_content(context)}],
        )
        # Models often wrap JSON in markdown fences; the harness json.loads the
        # raw string and rejects a leading ``` as schema_invalid.
        return _strip_markdown_fences(response.content[0].text)


class _OllamaProvider:
    provider_id = "ollama"

    def model_name(self) -> str:
        return os.getenv("AGENT_MODEL", _DEFAULT_OLLAMA_MODEL)

    def validate(self) -> None:
        return None

    async def invoke(self, role_prompt: str, context: dict[str, Any]) -> str:
        base = _ollama_base_url()
        url = f"{base}/v1/chat/completions"
        body = {
            "model": self.model_name(),
            "messages": [
                {"role": "system", "content": role_prompt},
                {"role": "user", "content": _user_content(context)},
            ],
            "temperature": _OLLAMA_TEMPERATURE,
            "max_tokens": _MAX_TOKENS,
        }
        try:
            async with httpx.AsyncClient(timeout=llm_timeout_seconds()) as client:
                response = await client.post(url, json=body)
                response.raise_for_status()
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            raise RuntimeError(
                f"Cannot connect to Ollama at {base}. "
                f"Is `ollama serve` running? (OLLAMA_BASE_URL={base})"
            ) from exc
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return _strip_markdown_fences(str(content))


def resolve_agent_provider() -> _AgentProvider:
    """
    Honour MODEL_PROVIDER when set; otherwise Anthropic iff ANTHROPIC_API_KEY
    is present, else stub. An explicit provider that cannot run raises.
    """
    explicit = os.getenv("MODEL_PROVIDER", "").strip().lower()
    if explicit:
        if explicit not in _KNOWN_PROVIDERS:
            raise RuntimeError(
                f"Unknown MODEL_PROVIDER={explicit!r}. "
                "Expected anthropic, ollama, or stub."
            )
        provider: _AgentProvider
        if explicit == "anthropic":
            provider = _AnthropicProvider()
        elif explicit == "ollama":
            provider = _OllamaProvider()
        else:
            provider = _StubProvider()
        provider.validate()
        return provider

    if os.getenv("ANTHROPIC_API_KEY"):
        provider = _AnthropicProvider()
    else:
        provider = _StubProvider()
    provider.validate()
    return provider


def agent_model_name() -> str:
    """Configured model id for the resolved provider (env: AGENT_MODEL)."""
    return resolve_agent_provider().model_name()


def agent_provider_status() -> dict[str, Any]:
    """Safe operator snapshot — no secrets."""
    provider = resolve_agent_provider()
    return {
        "provider": provider.provider_id,
        "model": provider.model_name(),
        "breaker_open": _agent_model_breaker.state == CircuitState.OPEN,
    }


def log_resolved_agent_provider() -> None:
    """Emit one startup line naming provider + model. Stub is WARNING."""
    status = agent_provider_status()
    if status["provider"] == "stub":
        logger.warning(
            "learning_agent_provider",
            provider="stub",
            model=status["model"],
            detail="Personas will not match scenario roles on the stub path.",
        )
        return
    logger.info(
        "learning_agent_provider",
        provider=status["provider"],
        model=status["model"],
    )


async def call_model(role_prompt: str, context: dict[str, Any]) -> str:
    """
    Invoke the configured agent model and return raw text.

    Both live and stub paths go through `_agent_model_breaker.execute(...)`.
    """
    provider = resolve_agent_provider()
    api_key_present = bool(os.getenv("ANTHROPIC_API_KEY"))
    path = "claude" if provider.provider_id == "anthropic" else provider.provider_id
    logger.info(
        "learning_call_model",
        model=provider.model_name(),
        path=path,
        api_key_present=api_key_present,
        provider=provider.provider_id,
    )
    return await _agent_model_breaker.execute(provider.invoke, role_prompt, context)
