# tests/test_grading.py — Pure-function coverage for four-dimension competency scoring.

from __future__ import annotations

from typing import Any

from core.agents.grading import grade_decision
from core.agents.scenario import ScenarioChoice

_RATIONALE_LP = (
    "Satisfies ISO 27001:2022 a.8.2 by provisioning access proportionate to the task."
)
_RATIONALE_AA = "Fails ISO 27001:2022 a.8.2 — privileged access rights must be restricted."
_CONSEQUENCE_ONLY = "Standing admin is never issued for the cutover window."


def _choice(
    choice_id: str,
    *,
    correct: bool,
    rationale: str | None = None,
    consequence: str = "",
) -> ScenarioChoice:
    return ScenarioChoice(
        choice_id=choice_id,
        label=choice_id,
        consequence=consequence,
        is_correct=correct,
        framework_rationale=rationale,
    )


_ACCESS: list[ScenarioChoice] = [
    _choice("approve_all", correct=False, rationale=_RATIONALE_AA),
    _choice("least_privilege", correct=True, rationale=_RATIONALE_LP),
    _choice("challenge", correct=False, rationale="Sound evidence-gathering, but no control yet."),
    _choice("deny", correct=False, rationale="Disproportionate under ISO 27001:2022 a.5.15."),
]

_ESCALATION: list[ScenarioChoice] = [
    _choice("approve_all", correct=False, rationale=_RATIONALE_AA),
    _choice("least_privilege", correct=True, rationale=_RATIONALE_LP),
    _choice("deny", correct=False, rationale="Disproportionate once a justification exists."),
    _choice("challenge", correct=False, rationale="Information-seeking at escalation."),
]


def _grade(
    choice_id: str,
    stage: str,
    *,
    choices: list[ScenarioChoice] | None = None,
    competency: dict[str, Any] | None = None,
    decisions: list[dict[str, Any]] | None = None,
) -> Any:
    prior = list(decisions or [])
    prior.append({"choice": choice_id})
    return grade_decision(
        choice_id=choice_id,
        stage=stage,
        scenario_choices=choices if choices is not None else _ACCESS,
        current_competency=competency or {},
        decisions_so_far=prior,
    )


def _full(score: int) -> dict[str, Any]:
    return {
        dim: {"score": score, "delta": 0, "observations": []}
        for dim in ("control_mapping", "evidence", "escalation", "remediation")
    }


def test_correct_choice_at_access_request() -> None:
    result = _grade("least_privilege", "access_request")
    assert result.correct is True
    assert result.framework_rationale == _RATIONALE_LP
    comp = result.updated_competency
    assert comp["control_mapping"]["score"] == 65
    assert comp["control_mapping"]["delta"] == 1
    assert comp["escalation"]["score"] == 60
    assert comp["escalation"]["delta"] == 1
    assert comp["evidence"]["score"] == 60
    assert comp["evidence"]["delta"] == 1
    assert comp["remediation"]["score"] == 50
    assert comp["remediation"]["delta"] == 0
    assert result.dimension_deltas == {
        "control_mapping": 15,
        "evidence": 10,
        "escalation": 10,
    }
    assert any("Control mapping improved" in o for o in result.observations)
    assert _RATIONALE_LP in "".join(result.observations)
    assert not any(o.startswith("Remediation") for o in result.observations)


def test_wrong_choice_at_access_request() -> None:
    result = _grade("approve_all", "access_request")
    assert result.correct is False
    comp = result.updated_competency
    assert comp["control_mapping"]["score"] == 40
    assert comp["control_mapping"]["delta"] == -1
    assert comp["escalation"]["score"] == 35
    assert comp["escalation"]["delta"] == -1
    assert comp["evidence"]["score"] == 50
    assert comp["evidence"]["delta"] == 0
    assert comp["remediation"]["score"] == 50
    assert result.dimension_deltas["control_mapping"] == -10
    assert result.dimension_deltas["escalation"] == -15
    assert "evidence" not in result.dimension_deltas


def test_challenge_choice_at_escalation_stage() -> None:
    result = _grade("challenge", "escalation", choices=_ESCALATION)
    assert result.correct is False
    comp = result.updated_competency
    assert comp["escalation"]["score"] == 70
    assert comp["escalation"]["delta"] == 1
    assert result.dimension_deltas["escalation"] == 20
    assert comp["control_mapping"]["score"] == 42
    assert result.dimension_deltas["control_mapping"] == -8
    assert comp["remediation"]["score"] == 40
    assert result.dimension_deltas["remediation"] == -10
    assert comp["evidence"]["score"] == 50


def test_approve_all_at_escalation_worst_path() -> None:
    result = _grade("approve_all", "escalation", choices=_ESCALATION)
    assert result.correct is False
    comp = result.updated_competency
    assert comp["control_mapping"]["score"] == 42
    assert comp["escalation"]["score"] == 35
    assert comp["evidence"]["score"] == 50
    assert comp["remediation"]["score"] == 40
    assert result.dimension_deltas == {
        "control_mapping": -8,
        "escalation": -15,
        "remediation": -10,
    }


def test_repeated_wrong_answers_evidence_penalty_stacks() -> None:
    first = _grade("approve_all", "access_request")
    assert first.updated_competency["evidence"]["score"] == 50
    assert "evidence" not in first.dimension_deltas

    second = _grade(
        "deny",
        "access_request",
        competency=first.updated_competency,
        decisions=[{"choice": "approve_all", "graded": {"correct": False}}],
    )
    assert second.updated_competency["evidence"]["score"] == 45
    assert second.dimension_deltas["evidence"] == -5

    third = _grade(
        "approve_all",
        "access_request",
        competency=second.updated_competency,
        decisions=[
            {"choice": "approve_all", "graded": {"correct": False}},
            {"choice": "deny", "graded": {"correct": False}},
        ],
    )
    assert third.updated_competency["evidence"]["score"] == 40
    assert third.dimension_deltas["evidence"] == -5


def test_score_clamping_at_0_and_100() -> None:
    high = _grade("least_privilege", "access_request", competency=_full(95))
    assert high.updated_competency["control_mapping"]["score"] == 100
    assert high.updated_competency["escalation"]["score"] == 100
    assert high.updated_competency["evidence"]["score"] == 100
    assert high.updated_competency["remediation"]["score"] == 95

    low = _grade("approve_all", "access_request", competency=_full(5))
    assert low.updated_competency["control_mapping"]["score"] == 0
    assert low.updated_competency["escalation"]["score"] == 0
    assert low.updated_competency["evidence"]["score"] == 5
    assert low.updated_competency["remediation"]["score"] == 5


def test_empty_current_competency_starts_at_50() -> None:
    result = _grade("least_privilege", "access_request", competency={})
    for dim in ("control_mapping", "evidence", "escalation", "remediation"):
        assert dim in result.updated_competency
    assert result.updated_competency["control_mapping"]["score"] == 65
    assert result.updated_competency["remediation"]["score"] == 50


def test_rationale_falls_back_to_consequence_when_null() -> None:
    choices = [
        _choice(
            "least_privilege",
            correct=True,
            rationale=None,
            consequence=_CONSEQUENCE_ONLY,
        )
    ]
    result = _grade("least_privilege", "access_request", choices=choices)
    assert result.framework_rationale == _CONSEQUENCE_ONLY
    assert _CONSEQUENCE_ONLY in "".join(result.observations)


def test_current_decision_excluded_from_prior_wrong_check() -> None:
    """A first miss must not count itself as a prior wrong answer."""
    result = grade_decision(
        choice_id="approve_all",
        stage="access_request",
        scenario_choices=_ACCESS,
        current_competency={},
        decisions_so_far=[{"choice": "approve_all", "graded": {"correct": False}}],
    )
    assert result.updated_competency["evidence"]["score"] == 50
    assert "evidence" not in result.dimension_deltas
