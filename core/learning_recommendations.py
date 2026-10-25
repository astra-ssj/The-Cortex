"""Deterministic, explainable practice ranking for Astra learners.

Recommendations are derived from governed curriculum metadata and competency
evidence. They never start a session or unlock content, so a low-confidence
result can be shown for review without becoming an autonomous action.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from core.competency import GAP_FLOOR, PROVEN_THRESHOLD
from core.governance import SovereignModel

Difficulty = Literal["foundation", "practitioner", "expert"]
NarrativeSource = Literal["deterministic", "local_model"]
ALGORITHM_VERSION = "adaptive-learning-v1"
_DIFFICULTY_ORDER: dict[str, int] = {
    "foundation": 0,
    "practitioner": 1,
    "expert": 2,
}


class CompetencySignal(SovereignModel):
    dimension: str
    score: int = Field(..., ge=0, le=100)
    proven: bool = False

    model_config = {"extra": "forbid", "frozen": True}


class RecommendationCandidate(SovereignModel):
    practice_id: str
    practice_version_id: str
    title: str
    difficulty: Difficulty
    target_dimensions: list[str] = Field(default_factory=list)
    locked: bool = False
    completed: bool = False
    diagnostic_match: bool = False

    model_config = {"extra": "forbid", "frozen": True}


class RankedPractice(SovereignModel):
    practice_id: str
    practice_version_id: str
    score: int
    reason_codes: list[str] = Field(default_factory=list)
    target_gap_dimensions: list[str] = Field(default_factory=list)
    recommended_difficulty: Difficulty

    model_config = {"extra": "forbid", "frozen": True}


class LearningRecommendation(SovereignModel):
    algorithm_version: str = ALGORITHM_VERSION
    recommended_practice_version_id: str | None
    recommended_difficulty: Difficulty
    target_gap_dimensions: list[str] = Field(default_factory=list)
    rationale: str
    confidence: float = Field(..., ge=0, le=1)
    requires_human_review: bool
    narrative_source: NarrativeSource = "deterministic"
    narrative_confidence: float = Field(default=1.0, ge=0, le=1)
    ranked: list[RankedPractice] = Field(default_factory=list)

    model_config = {"extra": "forbid", "frozen": True}


def _target_difficulty(signals: list[CompetencySignal], fallback: Difficulty) -> Difficulty:
    if not signals:
        return fallback
    weakest = min(signal.score for signal in signals)
    if weakest < GAP_FLOOR:
        return "foundation"
    if weakest < PROVEN_THRESHOLD or not all(signal.proven for signal in signals):
        return "practitioner"
    return "expert"


def rank_practices(
    candidates: list[RecommendationCandidate],
    competency: list[CompetencySignal],
    *,
    fallback_difficulty: Difficulty = "foundation",
    diagnostic_confidence: float | None = None,
) -> LearningRecommendation:
    """Rank eligible practices using stable scores and identifier tie-breaks."""
    by_dimension = {signal.dimension: signal for signal in competency}
    gaps = sorted(
        (
            signal
            for signal in competency
            if signal.score < GAP_FLOOR or not signal.proven
        ),
        key=lambda signal: (signal.score, signal.dimension),
    )
    desired = _target_difficulty(competency, fallback_difficulty)
    desired_order = _DIFFICULTY_ORDER[desired]

    ranked: list[RankedPractice] = []
    for candidate in candidates:
        if candidate.locked:
            continue
        reasons: list[str] = []
        target_gaps = [
            dimension
            for dimension in candidate.target_dimensions
            if dimension in {gap.dimension for gap in gaps}
        ]
        score = 0
        if target_gaps:
            reasons.append("targets_competency_gap")
            score += sum(
                30 + max(0, GAP_FLOOR - by_dimension[dimension].score)
                for dimension in target_gaps
            )
        if candidate.diagnostic_match:
            reasons.append("diagnostic_match")
            score += 24
        distance = abs(_DIFFICULTY_ORDER[candidate.difficulty] - desired_order)
        if distance == 0:
            reasons.append("adaptive_difficulty_match")
            score += 18
        elif distance == 1:
            score += 5
        if candidate.completed:
            reasons.append("already_completed")
            score -= 35
        ranked.append(
            RankedPractice(
                jurisdiction=candidate.jurisdiction,
                purpose_tags=["learning", "recommendation", "explainability"],
                practice_id=candidate.practice_id,
                practice_version_id=candidate.practice_version_id,
                score=score,
                reason_codes=reasons,
                target_gap_dimensions=target_gaps,
                recommended_difficulty=desired,
            )
        )

    ranked.sort(key=lambda item: (-item.score, item.practice_id, item.practice_version_id))
    selected = ranked[0] if ranked else None
    has_evidence = any(signal.score != 50 for signal in competency)
    has_diagnostic = any(candidate.diagnostic_match for candidate in candidates)
    confidence = (
        0.84
        if has_evidence
        else round(max(0, min(1, diagnostic_confidence)), 3)
        if has_diagnostic and diagnostic_confidence is not None
        else 0.7
    )
    target_gaps = selected.target_gap_dimensions if selected else []
    if selected and target_gaps:
        rationale = (
            f"Prioritised {selected.practice_id} to strengthen "
            f"{', '.join(target_gaps)} at {desired} difficulty."
        )
    elif selected:
        rationale = (
            f"Prioritised {selected.practice_id} using the published diagnostic "
            f"and {desired} difficulty."
        )
    else:
        rationale = "No eligible published practice is currently available."
    return LearningRecommendation(
        jurisdiction="internal",
        purpose_tags=["learning", "recommendation"],
        recommended_practice_version_id=(
            selected.practice_version_id if selected else None
        ),
        recommended_difficulty=desired,
        target_gap_dimensions=target_gaps,
        rationale=rationale,
        confidence=confidence,
        requires_human_review=confidence < 0.75,
        ranked=ranked,
    )
