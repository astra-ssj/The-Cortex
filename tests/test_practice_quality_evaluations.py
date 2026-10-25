from __future__ import annotations

import json
from pathlib import Path

from core.agents.grading import grade_decision
from core.agents.scenario import ScenarioChoice
from core.competency import DIMENSIONS, dimension_score

ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = json.loads(
    (ROOT / "content/practices/scenarios_v1_1.json").read_text(encoding="utf-8")
)
FIXTURES = json.loads(
    (ROOT / "content/practices/evaluation_fixtures_v2.json").read_text(encoding="utf-8")
)


def _choices(raw: dict[str, object]) -> list[ScenarioChoice]:
    return [
        ScenarioChoice(
            choice_id=str(choice["id"]),
            label=str(choice["label"]),
            consequence=str(choice["consequence"]),
            is_correct=bool(choice["is_correct"]),
            framework_rationale=str(choice["rationale"]),
            next_stage=str(choice["next_stage"]),
            risk_outcome=str(choice["risk_outcome"]),
            dimension_weights=dict(choice["dimension_weights"]),
            control_refs=tuple(choice["control_refs"]),
        )
        for choice in raw["choices"]  # type: ignore[index]
    ]


def _evaluate(
    scenario: dict[str, object],
    path: list[str],
) -> tuple[str, float]:
    stages = {str(stage["id"]): stage for stage in scenario["stages"]}  # type: ignore[index]
    current = str(scenario["entry_stage_id"])
    competency: dict[str, object] = {}
    decisions: list[dict[str, object]] = []
    for choice_id in path:
        assert current != "complete"
        choices = _choices(stages[current])
        chosen = next(choice for choice in choices if choice.choice_id == choice_id)
        decisions.append({"choice": choice_id})
        result = grade_decision(
            choice_id=choice_id,
            stage=current,
            scenario_choices=choices,
            current_competency=competency,
            decisions_so_far=decisions,
        )
        decisions[-1]["graded"] = {"correct": result.correct}
        competency = result.updated_competency
        current = str(chosen.next_stage)
    average = sum(dimension_score(competency, dimension) for dimension in DIMENSIONS) / len(
        DIMENSIONS
    )
    return current, average


def test_all_v11_evaluation_paths_terminate_with_calibrated_scores() -> None:
    scenarios = {item["slug"]: item for item in SCENARIOS["scenarios"]}

    assert len(FIXTURES["paths"]) == 15
    for fixture in FIXTURES["paths"]:
        scenario = scenarios[fixture["scenario_slug"]]
        for path_name in (
            "correct",
            "qualified_alternative",
            "failure",
            "defer",
            "mixed",
        ):
            terminal, average = _evaluate(scenario, fixture[path_name])
            expected = fixture["expected"][path_name]
            assert terminal == expected["terminal"]
            if "minimum_score" in expected:
                assert average >= expected["minimum_score"], (
                    fixture["scenario_slug"],
                    path_name,
                    average,
                )
            if "maximum_score" in expected:
                assert average <= expected["maximum_score"], (
                    fixture["scenario_slug"],
                    path_name,
                    average,
                )
