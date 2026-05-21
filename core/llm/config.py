# core/llm/config.py — Env-driven provider chain (Anthropic-first by default).

from __future__ import annotations

import os

# Ordered fallback chain, e.g. anthropic,openai,stub
_DEFAULT_CHAIN = "anthropic,openai,stub"


def llm_provider_chain() -> list[str]:
    raw = os.getenv("CORTEX_LLM_PROVIDERS") or os.getenv("CORTEX_LLM_PROVIDER") or _DEFAULT_CHAIN
    parts = [p.strip().lower() for p in raw.split(",") if p.strip()]
    return parts or ["stub"]


def llm_timeout_seconds() -> float:
    return float(os.getenv("CORTEX_LLM_TIMEOUT_SECONDS", "90"))


def anthropic_config() -> tuple[str | None, str]:
    return os.getenv("ANTHROPIC_API_KEY"), os.getenv(
        "ANTHROPIC_MODEL",
        "claude-sonnet-4-20250514",
    )


def openai_config() -> tuple[str | None, str]:
    return os.getenv("OPENAI_API_KEY"), os.getenv("OPENAI_MODEL", "gpt-4o-mini")


def max_ingest_chars() -> int:
    """Cap document text sent to LLM prompts (PII/cost control)."""
    return int(os.getenv("CORTEX_LLM_MAX_INGEST_CHARS", "24000"))


def assessment_llm_enabled() -> bool:
    """When false, assessment_engine uses demo findings (no LLM calls)."""
    return os.getenv("CORTEX_ASSESSMENT_LLM_ENABLED", "1").lower() not in ("0", "false", "no")


def assessment_max_controls_per_run() -> int:
    """Cap LLM assessments per run (0 = unlimited). Useful for demos and CI."""
    return int(os.getenv("CORTEX_ASSESSMENT_MAX_CONTROLS", "0"))
