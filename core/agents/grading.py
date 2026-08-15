# core/agents/grading.py — Score each learner decision against scenario_choices.
#
# Pure function: no DB access, no side effects. The controller owns persistence.
# Scores accumulate across four independent competency dimensions and clamp 0–100.
#
# The scoring model is content, not code: each choice row carries its own
# per-dimension point deltas (scenario_choices.dimension_weights, migration 027)
# so a new scenario ships its competency signal with its seed. The compiled-in
# CX-1001 heuristic below survives only as a fallback for HARDCODED_SCENARIO and
# pre-027 databases — it keys on CX-1001's stage slugs and choice ids, so it
# scores three of four dimensions at zero for any other scenario.

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from core.agents.scenario import ENTRY_STAGE, ESCALATION_STAGE, ScenarioChoice
from core.competency import DIMENSIONS as _DIMENSIONS
from core.competency import HUMAN_LABELS as _HUMAN_LABELS
from core.competency import START_SCORE as _START_SCORE

# Missing again after an earlier miss: the learner had the evidence and did not
# apply it. Session-scoped, so it cannot live on a choice row.
_REPEAT_MISS_EVIDENCE_PENALTY = -5


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


def _legacy_deltas(*, choice_id: str, stage: str, is_correct: bool) -> dict[str, int]:
    """
    Compiled-in CX-1001 scoring, used when a choice row carries no weights.

    Only reachable for HARDCODED_SCENARIO and for databases that predate
    migration 027. It keys on CX-1001's stage slugs and choice ids, which is
    exactly why authored scenarios supply dimension_weights instead.
    """
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

    remediation = 0
    if stage == ESCALATION_STAGE:
        remediation = 15 if is_correct else -10

    return {
        "control_mapping": control_mapping,
        "evidence": 10 if is_correct else 0,
        "escalation": escalation,
        "remediation": remediation,
    }


def _point_deltas(
    *,
    choice: ScenarioChoice | None,
    choice_id: str,
    stage: str,
    is_correct: bool,
    prior_wrong: bool,
) -> dict[str, int]:
    """
    Resolve this decision's per-dimension point changes.

    Authored weights on the choice row win; the CX-1001 heuristic is the fallback.
    The repeated-miss evidence penalty is applied on top of either source because
    it depends on session history, which no single choice row can express. It
    compounds rather than replaces: destroying evidence after an earlier miss is
    worse than destroying evidence first time.
    """
    weights = choice.dimension_weights if choice is not None else None
    if weights:
        deltas = {dim: int(weights.get(dim, 0)) for dim in _DIMENSIONS}
    else:
        deltas = _legacy_deltas(choice_id=choice_id, stage=stage, is_correct=is_correct)

    if not is_correct and prior_wrong:
        deltas["evidence"] += _REPEAT_MISS_EVIDENCE_PENALTY
    return deltas


def _observation(dimension: str, points: int, rationale: str, repeat_miss: bool) -> str:
    """
    One learner-facing sentence explaining a dimension's movement.

    control_mapping carries the authored framework rationale, because that is the
    dimension the rationale is written about. The rest describe the judgment in
    scenario-neutral terms so they read correctly for any track.
    """
    direction = "improved" if points > 0 else "declined"
    label = _HUMAN_LABELS[dimension]
    if dimension == "control_mapping":
        if rationale:
            return f"{label} {direction}: {rationale}"
        return f"{label} {direction}."
    if dimension == "evidence":
        if points > 0:
            return f"{label} {direction}: the decision was supportable by the recorded justification."
        if repeat_miss:
            return (
                f"{label} {direction}: a repeated incorrect choice suggests "
                "the available evidence was not applied."
            )
        return f"{label} {direction}: the decision weakened the evidence available to an auditor."
    if dimension == "escalation":
        if points > 0:
            return f"{label} {direction}: the right level of authority was engaged for the situation."
        return f"{label} {direction}: the decision escalated further or less far than the situation warranted."
    if points > 0:
        return f"{label} {direction}: the decision drove a durable fix rather than a point repair."
    return f"{label} {direction}: the decision left the underlying cause unaddressed."


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
    prior_wrong = _prior_wrong(decisions_so_far)
    repeat_miss = not is_correct and prior_wrong
    points = _point_deltas(
        choice=matched,
        choice_id=choice_id,
        stage=stage,
        is_correct=is_correct,
        prior_wrong=prior_wrong,
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
            note = _observation(dimension, change, rationale, repeat_miss)
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
