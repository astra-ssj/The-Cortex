from __future__ import annotations

import pytest
from pydantic import ValidationError

from core.curriculum import (
    ChoiceVersion,
    ContentProvenance,
    ScenarioVersion,
    StageVersion,
    TrackMembership,
    TrackVersion,
    canonical_content_hash,
    validate_track_prerequisite_dag,
    verify_content_hash,
)

SOVEREIGN = {"jurisdiction": "internal", "purpose_tags": ["learning"]}


def _provenance() -> ContentProvenance:
    return ContentProvenance(
        **SOVEREIGN,
        source_id="practice",
        source_version="v1",
        source_hash="a" * 64,
        reviewed_by="reviewer@example.com",
    )


def _choice(choice_id: str, target: str, *, correct: bool = False) -> ChoiceVersion:
    return ChoiceVersion(
        **SOVEREIGN,
        id=choice_id,
        label=choice_id,
        is_correct=correct,
        next_stage_id=target,
        dimension_weights={"evidence": 10},
        control_refs=["a.5.33"],
    )


def _scenario(*stages: StageVersion) -> ScenarioVersion:
    return ScenarioVersion(
        **SOVEREIGN,
        scenario_id="evidence-freshness",
        version=1,
        status="published",
        entry_stage_id="start",
        answer_policy="exactly_one",
        stages=list(stages),
        provenance=_provenance(),
        content_hash="b" * 64,
    )


def test_scenario_accepts_reachable_dag_with_terminal_path() -> None:
    scenario = _scenario(
        StageVersion(
            **SOVEREIGN,
            id="start",
            sequence=1,
            choices=[
                _choice("inspect", "complete", correct=True),
                _choice("guess", "complete"),
            ],
        ),
        StageVersion(**SOVEREIGN, id="complete", sequence=2, terminal=True),
    )
    assert scenario.entry_stage_id == "start"


@pytest.mark.parametrize(
    "stages, message",
    [
        (
            [
                StageVersion(
                    **SOVEREIGN,
                    id="start",
                    sequence=1,
                    choices=[_choice("loop", "start", correct=True)],
                )
            ],
            "DAG",
        ),
        (
            [
                StageVersion(
                    **SOVEREIGN,
                    id="start",
                    sequence=1,
                    choices=[_choice("finish", "complete")],
                ),
                StageVersion(**SOVEREIGN, id="complete", sequence=2, terminal=True),
            ],
            "exactly one",
        ),
    ],
)
def test_scenario_rejects_invalid_graph_or_answer_policy(
    stages: list[StageVersion],
    message: str,
) -> None:
    with pytest.raises(ValidationError, match=message):
        _scenario(*stages)


def test_choice_rejects_unknown_dimension_and_invalid_control() -> None:
    with pytest.raises(ValidationError, match="unknown competency"):
        ChoiceVersion(
            **SOVEREIGN,
            id="bad",
            label="bad",
            next_stage_id="complete",
            dimension_weights={"speed": 1},
        )
    with pytest.raises(ValidationError, match="invalid control"):
        ChoiceVersion(
            **SOVEREIGN,
            id="bad-ref",
            label="bad",
            next_stage_id="complete",
            control_refs=["drop table controls"],
        )


def test_track_prerequisites_must_be_acyclic() -> None:
    first = TrackVersion(
        **SOVEREIGN,
        track_id="first",
        version=1,
        status="published",
        memberships=[
            TrackMembership(
                **SOVEREIGN,
                scenario_version_id="scenario-v1",
                position=1,
            )
        ],
        prerequisite_track_version_ids=["track-b"],
        content_hash="c" * 64,
    )
    second = TrackVersion(
        **SOVEREIGN,
        track_id="second",
        version=1,
        status="published",
        prerequisite_track_version_ids=["track-a"],
        content_hash="d" * 64,
    )
    with pytest.raises(ValueError, match="DAG"):
        validate_track_prerequisite_dag([first, second], ["track-a", "track-b"])


def test_canonical_hash_verification_detects_tampering() -> None:
    content = {"stages": [{"id": "start"}], "version": 1}
    digest = canonical_content_hash(content)
    verify_content_hash(content, digest)
    with pytest.raises(ValueError, match="does not match"):
        verify_content_hash({**content, "version": 2}, digest)
