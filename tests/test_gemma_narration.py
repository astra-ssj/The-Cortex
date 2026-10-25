from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from core.agents.narration import (
    briefing_facts,
    clear_narration_cache,
    narrate,
)
from scripts.verify_gemma_bundle import verify_archive


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    clear_narration_cache()


@pytest.mark.asyncio
async def test_stub_provider_keeps_the_deterministic_sentence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "stub")

    result = await narrate(
        kind="debrief",
        facts={"correct_count": 1, "decision_count": 2},
        fallback="Reviewed sentence.",
        required_practice_id=None,
    )

    assert result.source == "deterministic"
    assert result.narrative == "Reviewed sentence."
    assert result.invoked_model is False
    assert result.requires_human_review is False
    assert result.practice_id is None


@pytest.mark.asyncio
async def test_local_model_narration_must_cite_supplied_facts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "ollama")
    monkeypatch.setenv("AGENT_MODEL", "gemma4:12b")

    async def accepted(_role: str, context: dict[str, object]) -> str:
        fact = context["allowed_facts"][0]
        return json.dumps(
            {
                "narrative": "The ranker selected the supplied practice.",
                "cited_facts": [fact],
                "confidence": 0.91,
                "practice_id": "evidence-first",
            }
        )

    async def invented(_role: str, _context: dict[str, object]) -> str:
        return json.dumps(
            {
                "narrative": "Use a different practice.",
                "cited_facts": ["practice_id=other-practice"],
                "confidence": 0.95,
                "practice_id": "other-practice",
            }
        )

    monkeypatch.setattr("core.agents.narration.call_model", accepted)
    grounded = await narrate(
        kind="recommendation",
        facts={"practice_id": "evidence-first", "difficulty": "foundation"},
        fallback="Prioritised evidence-first.",
        required_practice_id="evidence-first",
    )
    assert grounded.source == "local_model"
    assert grounded.practice_id == "evidence-first"
    assert grounded.requires_human_review is False

    clear_narration_cache()
    monkeypatch.setattr("core.agents.narration.call_model", invented)
    rejected = await narrate(
        kind="recommendation",
        facts={"practice_id": "evidence-first", "difficulty": "foundation"},
        fallback="Prioritised evidence-first.",
        required_practice_id="evidence-first",
    )
    assert rejected.source == "deterministic"
    assert rejected.narrative == "Prioritised evidence-first."
    assert rejected.practice_id == "evidence-first"
    assert rejected.requires_human_review is True


@pytest.mark.asyncio
async def test_low_confidence_and_model_errors_keep_the_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "ollama")

    async def unsure(_role: str, context: dict[str, object]) -> str:
        return json.dumps(
            {
                "narrative": "Maybe this is the gap.",
                "cited_facts": [context["allowed_facts"][0]],
                "confidence": 0.4,
                "practice_id": None,
            }
        )

    async def broken(_role: str, _context: dict[str, object]) -> str:
        raise RuntimeError("ollama unavailable")

    monkeypatch.setattr("core.agents.narration.call_model", unsure)
    low = await narrate(
        kind="debrief",
        facts={"correct_count": 0},
        fallback="Reviewed debrief.",
        required_practice_id=None,
    )
    assert low.narrative == "Reviewed debrief."
    assert low.requires_human_review is True

    clear_narration_cache()
    monkeypatch.setattr("core.agents.narration.call_model", broken)
    failed = await narrate(
        kind="debrief",
        facts={"correct_count": 1},
        fallback="Reviewed debrief.",
        required_practice_id=None,
    )
    assert failed.narrative == "Reviewed debrief."
    assert failed.invoked_model is True
    assert failed.requires_human_review is True


@pytest.mark.asyncio
async def test_repeated_facts_do_not_call_the_model_again(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "ollama")
    calls = {"count": 0}

    async def accepted(_role: str, context: dict[str, object]) -> str:
        calls["count"] += 1
        return json.dumps(
            {
                "narrative": "Cached local explanation.",
                "cited_facts": [context["allowed_facts"][0]],
                "confidence": 0.88,
                "practice_id": None,
            }
        )

    monkeypatch.setattr("core.agents.narration.call_model", accepted)
    first = await narrate(
        kind="briefing",
        facts={"learner_count": 2},
        fallback="Two learners.",
        required_practice_id=None,
    )
    second = await narrate(
        kind="briefing",
        facts={"learner_count": 2},
        fallback="Two learners.",
        required_practice_id=None,
    )
    assert first.narrative == second.narrative == "Cached local explanation."
    assert calls["count"] == 1


def test_briefing_facts_name_stuck_learners_and_the_suggested_practice() -> None:
    facts = briefing_facts(
        [
            {"display_name": "ada@example.com", "overdue": 1, "completed": 0},
            {"display_name": "grace@example.com", "overdue": 0, "completed": 2},
        ],
        "supplier_incident_response",
    )
    assert facts["learner_count"] == 2
    assert facts["stuck_learners"] == ["ada@example.com"]
    assert facts["suggested_practice_id"] == "supplier_incident_response"


def test_gemma_archive_checksum_must_match(tmp_path: Path) -> None:
    archive = tmp_path / "astra-gemma4-12b.tar"
    archive.write_bytes(b"offline-weights-stand-in")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    sidecar = Path(str(archive) + ".sha256")
    sidecar.write_text(digest + "\n", encoding="utf-8")
    assert verify_archive(archive) == digest

    sidecar.write_text("a" * 64 + "\n", encoding="utf-8")
    with pytest.raises(SystemExit, match="does not match"):
        verify_archive(archive)
