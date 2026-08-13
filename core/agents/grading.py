# core/agents/grading.py — Score each learner decision against scenario_choices.
#
# Pure function: no DB access, no side effects. The controller owns persistence.
# Scores accumulate across four independent competency dimensions and clamp 0–100.

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from core.agents.scenario import ENTRY_STAGE, ESCALATION_STAGE, ScenarioChoice

_DIMENSIONS: tuple[str, ...] = (
    "control_mapping",
    "evidence",
    "escalation",
    "remediation",
)
_START_SCORE = 50
_HUMAN_LABELS: dict[str, str] = {
    "control_mapping": "Control mapping",
    "evidence": "Evidence quality",
    "escalation": "Escalation judgment",
    "remediation": "Remediation",
}


@dataclass(frozen=True)
class GradingResult:
    correct: bool
    framework_rationale: str
    dimension_deltas: dict[str, int]
    updated_competency: dict[str, Any]
    observations: list[str]


def _clamp(score: int) -> int:
    return max(0, min(100, score))


def _sign(points: int) -> int:
    if points > 0:
        return 1
    if points < 0:
        return -1
    return 0


def _lookup(choices: list[ScenarioChoice], choice_id: str) -> ScenarioChoice | None:
    for choice in choices:
        if choice.choice_id == choice_id:
            return choice
    return None


def _reference_text(choice: ScenarioChoice | None) -> str:
    """framework_rationale is nullable — fall back to consequence."""
    if choice is None:
        return ""
    rationale = (choice.framework_rationale or "").strip()
    if rationale:
        return rationale
    return (choice.consequence or "").strip()


def _prior_wrong(decisions_so_far: list[dict[str, Any]]) -> bool:
    """Exclude the current decision (last entry) when looking for earlier misses."""
    for entry in decisions_so_far[:-1]:
        if not isinstance(entry, dict):
            continue
        graded = entry.get("graded")
        if isinstance(graded, dict) and graded.get("correct") is False:
            return True
    return False


def _point_deltas(
    *,
    choice_id: str,
    stage: str,
    is_correct: bool,
    prior_wrong: bool,
) -> dict[str, int]:
    control_mapping = 0
    if stage == ENTRY_STAGE:
        control_mapping = 15 if is_correct else -10
    elif stage == ESCALATION_STAGE:
        control_mapping = 10 if is_correct else -8

    if choice_id == "challenge":
        escalation = 20
    elif choice_id == "least_privilege":
        escalation = 10
    elif choice_id == "approve_all":
        escalation = -15
    else:
        escalation = 0

    if is_correct:
        evidence = 10
    elif prior_wrong:
        evidence = -5
    else:
        evidence = 0

    remediation = 0
    if stage == ESCALATION_STAGE:
        remediation = 15 if is_correct else -10

    return {
        "control_mapping": control_mapping,
        "evidence": evidence,
        "escalation": escalation,
        "remediation": remediation,
    }


def _observation(dimension: str, points: int, rationale: str) -> str:
    direction = "improved" if points > 0 else "declined"
    label = _HUMAN_LABELS[dimension]
    if dimension == "control_mapping":
        if rationale:
            return f"{label} {direction}: {rationale}"
        return f"{label} {direction}."
    if dimension == "evidence":
        if points > 0:
            return f"{label} {direction}: the decision was supportable by the recorded justification."
        return (
            f"{label} {direction}: a repeated incorrect choice suggests "
            "the available evidence was not applied."
        )
    if dimension == "escalation":
        if points > 0:
            return (
                f"{label} {direction}: the learner sought information or "
                "approved with controlled scope."
            )
        return f"{label} {direction}: the request was approved without scrutiny."
    if points > 0:
        return f"{label} {direction}: the escalation-stage decision matched the reference control."
    return f"{label} {direction}: the escalation-stage decision did not apply a proportionate control."


def _seed_dimension(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"score": _START_SCORE, "delta": 0, "observations": []}
    try:
        score = int(raw.get("score", _START_SCORE))
    except (TypeError, ValueError):
        score = _START_SCORE
    prior_obs = raw.get("observations") if isinstance(raw.get("observations"), list) else []
    return {
        "score": _clamp(score),
        "delta": 0,
        "observations": [str(item) for item in prior_obs],
    }


def grade_decision(
    choice_id: str,
    stage: str,
    scenario_choices: list[ScenarioChoice],
    current_competency: dict[str, Any],
    decisions_so_far: list[dict[str, Any]],
) -> GradingResult:
    """
    Score one learner choice against the reference answers for this stage.

    Dimensions missing from current_competency start at 50. Point changes
    clamp the running score to 0–100. `delta` on each dimension is -1, 0, or 1
    for the UI, not the raw point change.
    """
    matched = _lookup(scenario_choices, choice_id)
    is_correct = bool(matched.is_correct) if matched is not None else False
    rationale = _reference_text(matched)
    points = _point_deltas(
        choice_id=choice_id,
        stage=stage,
        is_correct=is_correct,
        prior_wrong=_prior_wrong(decisions_so_far),
    )

    source = current_competency if isinstance(current_competency, dict) else {}
    updated: dict[str, Any] = {}
    moved: dict[str, int] = {}
    observations: list[str] = []

    for dimension in _DIMENSIONS:
        dim = _seed_dimension(source.get(dimension))
        change = points[dimension]
        dim["score"] = _clamp(int(dim["score"]) + change)
        dim["delta"] = _sign(change)
        if change != 0:
            note = _observation(dimension, change, rationale)
            dim["observations"] = list(dim["observations"]) + [note]
            moved[dimension] = change
            observations.append(note)
        updated[dimension] = dim

    return GradingResult(
        correct=is_correct,
        framework_rationale=rationale,
        dimension_deltas=moved,
        updated_competency=updated,
        observations=observations,
    )
