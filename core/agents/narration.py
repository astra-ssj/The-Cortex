"""Grounded local narration for debrief, next practice, and instructor briefing.

The grader and the ranker own the facts. Gemma 4 may only restate those facts.
A cited fact that was not supplied, a different practice id, a confidence below
0.75, or any model failure keeps the deterministic sentence.
"""

from __future__ import annotations

import hashlib
import json
from collections import OrderedDict
from typing import Any, Literal

from pydantic import Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from core.agents.model import agent_model_name, call_model, resolve_agent_provider
from core.audit_fabric import append_audit_log
from core.governance import SovereignModel

_CACHE_MAX = 128
_cache: OrderedDict[str, "GroundedNarration"] = OrderedDict()

_ROLE_PROMPT = (
    "You explain Astra GRC training evidence. Use only the allowed facts. "
    "Do not change a score, invent a practice, or give certification advice."
)
_CONTRACT = (
    "Respond ONLY as JSON with keys narrative, cited_facts, confidence, practice_id. "
    "cited_facts must be copied exactly from allowed_facts. "
    "practice_id must equal required_practice_id, using null when required_practice_id is null. "
    "No preamble and no markdown."
)


class GroundedNarration(SovereignModel):
    narrative: str
    cited_facts: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    source: Literal["local_model", "deterministic"]
    requires_human_review: bool
    provider: str
    model: str
    practice_id: str | None = None
    invoked_model: bool = False

    model_config = {"extra": "forbid"}


def clear_narration_cache() -> None:
    _cache.clear()


def allowed_fact_strings(facts: dict[str, Any]) -> list[str]:
    """Stable fact lines the model is allowed to cite."""
    lines: list[str] = []
    for key in sorted(facts):
        value = facts[key]
        if isinstance(value, list):
            lines.extend(f"{key}={item}" for item in value)
        elif value is None:
            lines.append(f"{key}=null")
        else:
            lines.append(f"{key}={value}")
    return lines


def debrief_facts(debrief: Any) -> dict[str, Any]:
    decisions = []
    for decision in debrief.decisions[:8]:
        decisions.append(
            f"{decision.chosen_id}|correct={str(bool(decision.correct)).lower()}"
        )
    return {
        "scenario": debrief.scenario_slug,
        "correct_count": debrief.correct_count,
        "decision_count": debrief.decision_count,
        "risk": debrief.risk or "unknown",
        "gap_dimensions": list(debrief.gap_dimensions),
        "decisions": decisions,
    }


def recommendation_facts(recommendation: Any) -> dict[str, Any]:
    selected = next(
        (
            item
            for item in recommendation.ranked
            if item.practice_version_id == recommendation.recommended_practice_version_id
        ),
        None,
    )
    return {
        "practice_id": selected.practice_id if selected else None,
        "difficulty": recommendation.recommended_difficulty,
        "reason_codes": list(selected.reason_codes) if selected else [],
        "target_gap_dimensions": list(recommendation.target_gap_dimensions),
        "template_rationale": recommendation.rationale,
    }


def briefing_facts(
    progress: list[dict[str, Any]],
    suggested_practice_id: str | None,
) -> dict[str, Any]:
    stuck = [
        str(item.get("display_name") or item.get("learner_id") or "")
        for item in progress
        if int(item.get("overdue") or 0) > 0
    ]
    return {
        "learner_count": len(progress),
        "overdue_count": sum(int(item.get("overdue") or 0) for item in progress),
        "completed_count": sum(int(item.get("completed") or 0) for item in progress),
        "stuck_learners": [name for name in stuck if name][:8],
        "suggested_practice_id": suggested_practice_id,
    }


def _fallback(kind: str, facts: dict[str, Any], fallback: str) -> str:
    if fallback.strip():
        return fallback.strip()
    if kind == "debrief":
        return (
            f"{facts.get('correct_count', 0)} of {facts.get('decision_count', 0)} "
            "decisions matched the reference answer."
        )
    return "The reviewed training record stands without a model rewrite."


def _deterministic(
    *,
    narrative: str,
    practice_id: str | None,
    requires_human_review: bool,
    invoked_model: bool,
    confidence: float = 1.0,
) -> GroundedNarration:
    provider = resolve_agent_provider()
    return GroundedNarration(
        jurisdiction="internal",
        purpose_tags=["learning", "narration"],
        narrative=narrative,
        cited_facts=[],
        confidence=confidence,
        source="deterministic",
        requires_human_review=requires_human_review,
        provider=provider.provider_id,
        model=provider.model_name(),
        practice_id=practice_id,
        invoked_model=invoked_model,
    )


def _cache_get(key: str) -> GroundedNarration | None:
    cached = _cache.get(key)
    if cached is None:
        return None
    _cache.move_to_end(key)
    return cached


def _cache_put(key: str, value: GroundedNarration) -> GroundedNarration:
    _cache[key] = value
    _cache.move_to_end(key)
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return value


def _practice_id(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _accept_model_payload(
    raw: str,
    *,
    allowed: set[str],
    required_practice_id: str | None,
) -> GroundedNarration | None:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    narrative = str(data.get("narrative") or "").strip()
    cited = data.get("cited_facts")
    if not narrative or not isinstance(cited, list) or not all(isinstance(item, str) for item in cited):
        return None
    if any(item not in allowed for item in cited):
        return None
    if _practice_id(data.get("practice_id")) != required_practice_id:
        return None
    try:
        confidence = float(data.get("confidence"))
    except (TypeError, ValueError):
        return None
    if confidence < 0.75 or confidence > 1:
        return None
    try:
        return GroundedNarration(
            jurisdiction="internal",
            purpose_tags=["learning", "narration"],
            narrative=narrative,
            cited_facts=list(cited),
            confidence=confidence,
            source="local_model",
            requires_human_review=False,
            provider="ollama",
            model=agent_model_name(),
            practice_id=required_practice_id,
            invoked_model=True,
        )
    except ValidationError:
        return None


async def narrate(
    *,
    kind: Literal["debrief", "recommendation", "briefing"],
    facts: dict[str, Any],
    fallback: str,
    required_practice_id: str | None,
) -> GroundedNarration:
    """Return a cached local narration, or the deterministic sentence."""
    narrative = _fallback(kind, facts, fallback)
    provider = resolve_agent_provider()
    key = hashlib.sha256(
        json.dumps(
            {
                "kind": kind,
                "facts": facts,
                "practice_id": required_practice_id,
                "provider": provider.provider_id,
                "model": provider.model_name(),
            },
            sort_keys=True,
            default=str,
        ).encode()
    ).hexdigest()
    cached = _cache_get(key)
    if cached is not None:
        return cached

    if provider.provider_id != "ollama":
        return _cache_put(
            key,
            _deterministic(
                narrative=narrative,
                practice_id=required_practice_id,
                requires_human_review=False,
                invoked_model=False,
            ),
        )

    allowed = allowed_fact_strings(facts)
    try:
        raw = await call_model(
            _ROLE_PROMPT,
            {
                "allowed_facts": allowed,
                "required_practice_id": required_practice_id,
                "response_contract": _CONTRACT,
            },
        )
    except Exception:
        return _cache_put(
            key,
            _deterministic(
                narrative=narrative,
                practice_id=required_practice_id,
                requires_human_review=True,
                invoked_model=True,
                confidence=0.0,
            ),
        )

    accepted = _accept_model_payload(
        raw,
        allowed=set(allowed),
        required_practice_id=required_practice_id,
    )
    if accepted is None:
        return _cache_put(
            key,
            _deterministic(
                narrative=narrative,
                practice_id=required_practice_id,
                requires_human_review=True,
                invoked_model=True,
                confidence=0.0,
            ),
        )
    return _cache_put(key, accepted)


async def audit_invoked_narration(
    db: AsyncSession,
    *,
    kind: str,
    entity_type: str,
    entity_id: str | None,
    org_id: str,
    actor: str,
    narration: GroundedNarration,
) -> None:
    """Append start and complete rows only when a local model was invoked."""
    if not narration.invoked_model:
        return
    payload = {
        "kind": kind,
        "source": narration.source,
        "confidence": narration.confidence,
        "requires_human_review": narration.requires_human_review,
        "practice_id": narration.practice_id,
        "org_id": org_id,
    }
    start = await append_audit_log(
        db,
        event_type="narration.start",
        entity_type=entity_type,
        entity_id=entity_id,
        org_id=org_id,
        actor=actor,
        payload=payload,
    )
    await append_audit_log(
        db,
        event_type="narration.complete",
        entity_type=entity_type,
        entity_id=entity_id,
        org_id=org_id,
        actor=actor,
        prev_hash_override=start,
        payload=payload,
    )
