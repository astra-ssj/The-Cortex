"""Deterministic learner diagnostic scoring and curriculum recommendation."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from core.governance import SovereignModel

ExperienceLevel = Literal["new", "developing", "experienced"]

DIAGNOSTIC_QUESTIONS = (
    {
        "id": "evidence",
        "prompt": "What evidence would you request before accepting a control as effective?",
    },
    {
        "id": "escalation",
        "prompt": "When would you escalate a control weakness, and to whom?",
    },
    {
        "id": "remediation",
        "prompt": "How would you prioritise remediation when several gaps compete for attention?",
    },
)
ALGORITHM_VERSION = "learner-diagnostic-v1"


class DiagnosticProfile(SovereignModel):
    role: str = Field(..., min_length=2, max_length=120)
    experience_level: ExperienceLevel
    target_framework: str = Field(..., min_length=2, max_length=120)
    learning_goal: str = Field(..., min_length=5, max_length=1000)


class AuthoredDiagnosticResponse(SovereignModel):
    question_id: str = Field(..., min_length=1, max_length=80)
    response: str = Field(..., min_length=20, max_length=4000)
    rationale: str = Field(..., min_length=10, max_length=4000)
    confidence: float = Field(..., ge=0, le=1)


class DiagnosticRecommendation(SovereignModel):
    track_id: str | None
    practice_id: str | None
    rationale: str
    confidence: float = Field(..., ge=0, le=1)
    algorithm_version: str = ALGORITHM_VERSION


def recommend(
    profile: DiagnosticProfile,
    responses: list[AuthoredDiagnosticResponse],
    *,
    tracks: list[dict[str, str]],
    practices: list[dict[str, object]],
) -> DiagnosticRecommendation:
    """Rank only published records with stable, explainable rules."""
    expected = {item["id"] for item in DIAGNOSTIC_QUESTIONS}
    if {item.question_id for item in responses} != expected:
        raise ValueError("one authored response is required for every diagnostic question")

    framework = profile.target_framework.casefold()
    goal_terms = set(profile.learning_goal.casefold().split())

    def practice_score(item: dict[str, object]) -> tuple[int, str]:
        frameworks = [str(value).casefold() for value in item.get("frameworks", [])]
        text = " ".join(
            [str(item.get("title", "")), str(item.get("summary", "")), *frameworks]
        ).casefold()
        score = (8 if framework in frameworks or framework in text else 0)
        score += sum(1 for term in goal_terms if len(term) > 3 and term in text)
        difficulty = str(item.get("difficulty", "foundation"))
        desired = {"new": "foundation", "developing": "practitioner", "experienced": "expert"}[
            profile.experience_level
        ]
        score += 3 if difficulty == desired else 0
        return score, str(item.get("practice_id", ""))

    ranked = sorted(practices, key=practice_score, reverse=True)
    practice_id = str(ranked[0]["practice_id"]) if ranked else None
    track_id = str(tracks[0]["track_id"]) if tracks else None
    average_confidence = sum(item.confidence for item in responses) / len(responses)
    confidence = round(min(0.95, 0.6 + average_confidence * 0.3), 3)
    rationale = (
        f"Matched {profile.experience_level} experience and the "
        f"{profile.target_framework} target to published curriculum"
        + (f", prioritising {practice_id}." if practice_id else ".")
    )
    return DiagnosticRecommendation(
        jurisdiction=profile.jurisdiction,
        purpose_tags=["learning", "onboarding", "recommendation"],
        track_id=track_id,
        practice_id=practice_id,
        rationale=rationale,
        confidence=confidence,
    )
