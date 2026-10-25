from __future__ import annotations

import pytest

from core.diagnostic import (
    DIAGNOSTIC_QUESTIONS,
    AuthoredDiagnosticResponse,
    DiagnosticProfile,
    recommend,
)

SOVEREIGN = {"jurisdiction": "internal", "purpose_tags": ["learning", "onboarding"]}


def _responses() -> list[AuthoredDiagnosticResponse]:
    return [
        AuthoredDiagnosticResponse(
            **SOVEREIGN,
            question_id=question["id"],
            response="I would gather attributable evidence and verify its operating period.",
            rationale="The conclusion must be reproducible by another reviewer.",
            confidence=0.8,
        )
        for question in DIAGNOSTIC_QUESTIONS
    ]


def test_recommendation_is_deterministic_and_prefers_framework_and_level() -> None:
    profile = DiagnosticProfile(
        **SOVEREIGN,
        role="GRC analyst",
        experience_level="developing",
        target_framework="iso27001-2022",
        learning_goal="Improve evidence review",
    )
    practices = [
        {
            "practice_id": "generic",
            "title": "General controls",
            "summary": "A foundation exercise",
            "frameworks": ["general"],
            "difficulty": "foundation",
        },
        {
            "practice_id": "evidence-review",
            "title": "Evidence review",
            "summary": "Review evidence against ISO controls",
            "frameworks": ["iso27001-2022"],
            "difficulty": "practitioner",
        },
    ]
    first = recommend(
        profile,
        _responses(),
        tracks=[{"track_id": "iso-track"}],
        practices=practices,
    )
    second = recommend(
        profile,
        _responses(),
        tracks=[{"track_id": "iso-track"}],
        practices=practices,
    )
    assert first == second
    assert first.practice_id == "evidence-review"
    assert first.track_id == "iso-track"
    assert first.confidence == pytest.approx(0.84)


def test_recommendation_requires_every_authored_question() -> None:
    profile = DiagnosticProfile(
        **SOVEREIGN,
        role="Auditor",
        experience_level="new",
        target_framework="soc2",
        learning_goal="Learn evidence collection",
    )
    with pytest.raises(ValueError, match="every diagnostic question"):
        recommend(profile, _responses()[:-1], tracks=[], practices=[])
