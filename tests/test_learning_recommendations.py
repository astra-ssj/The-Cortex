from core.competency import rollup_dimensions
from core.learning_recommendations import (
    CompetencySignal,
    RecommendationCandidate,
    rank_practices,
)

SOVEREIGN = {"jurisdiction": "internal", "purpose_tags": ["learning"]}


def _candidate(
    practice_id: str,
    difficulty: str,
    dimensions: list[str],
    **overrides: object,
) -> RecommendationCandidate:
    return RecommendationCandidate(
        **SOVEREIGN,
        practice_id=practice_id,
        practice_version_id=f"{practice_id}-v1",
        title=practice_id,
        difficulty=difficulty,
        target_dimensions=dimensions,
        **overrides,
    )


def _signal(dimension: str, score: int, *, proven: bool = False) -> CompetencySignal:
    return CompetencySignal(
        **SOVEREIGN,
        dimension=dimension,
        score=score,
        proven=proven,
    )


def test_weakest_competency_gap_outranks_diagnostic_preference() -> None:
    result = rank_practices(
        [
            _candidate(
                "diagnostic-choice",
                "practitioner",
                ["control_mapping"],
                diagnostic_match=True,
            ),
            _candidate("evidence-foundation", "foundation", ["evidence"]),
        ],
        [
            _signal("control_mapping", 68),
            _signal("evidence", 35),
        ],
        fallback_difficulty="practitioner",
    )

    assert result.recommended_practice_version_id == "evidence-foundation-v1"
    assert result.recommended_difficulty == "foundation"
    assert result.target_gap_dimensions == ["evidence"]
    assert result.confidence == 0.84
    assert result.requires_human_review is False


def test_locked_practices_are_excluded_and_ties_are_stable() -> None:
    result = rank_practices(
        [
            _candidate("locked", "foundation", ["evidence"], locked=True),
            _candidate("zeta", "foundation", ["evidence"]),
            _candidate("alpha", "foundation", ["evidence"]),
        ],
        [_signal("evidence", 40)],
    )

    assert [item.practice_id for item in result.ranked] == ["alpha", "zeta"]
    assert result.recommended_practice_version_id == "alpha-v1"


def test_no_evidence_or_diagnostic_requires_review() -> None:
    result = rank_practices(
        [_candidate("starter", "foundation", ["evidence"])],
        [],
    )

    assert result.recommended_practice_version_id == "starter-v1"
    assert result.confidence == 0.7
    assert result.requires_human_review is True


def test_low_confidence_diagnostic_remains_pending_review() -> None:
    result = rank_practices(
        [
            _candidate(
                "diagnostic-choice",
                "foundation",
                ["evidence"],
                diagnostic_match=True,
            )
        ],
        [],
        diagnostic_confidence=0.72,
    )

    assert result.confidence == 0.72
    assert result.requires_human_review is True


def test_proven_dimensions_allow_expert_difficulty() -> None:
    result = rank_practices(
        [
            _candidate("practitioner", "practitioner", ["evidence"]),
            _candidate("expert", "expert", ["evidence"]),
        ],
        [_signal("evidence", 82, proven=True)],
    )

    assert result.recommended_practice_version_id == "expert-v1"
    assert result.recommended_difficulty == "expert"


def test_unassessed_neutral_dimension_does_not_erase_prior_signal() -> None:
    sessions = [
        {
            "scenario": "evidence-review",
            "competency": {"evidence": {"score": 74}},
        },
        {
            "scenario": "escalation-review",
            "competency": {
                "evidence": {"score": 50},
                "escalation": {"score": 68},
            },
        },
    ]

    by_dimension = {item.dimension: item for item in rollup_dimensions(sessions)}

    assert by_dimension["evidence"].score == 74
    assert by_dimension["escalation"].score == 68
