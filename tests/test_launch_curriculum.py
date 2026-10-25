from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from core.agents.scenario import _rows_to_scenario, risk_for_choice, stage_after_choice
from core.curriculum import (
    ChoiceVersion,
    ContentProvenance,
    ScenarioVersion,
    StageVersion,
    verify_content_hash,
)

ROOT = Path(__file__).resolve().parents[1]
SCENARIOS_PATH = ROOT / "content" / "practices" / "launch_scenarios.json"
FIXTURES_PATH = ROOT / "content" / "practices" / "evaluation_fixtures.json"
MIGRATION_PATH = ROOT / "migrations" / "042_reviewed_launch_curriculum.sql"
SOVEREIGN = {"jurisdiction": "international", "purpose_tags": ["learning", "competency"]}


def _document() -> dict[str, Any]:
    return json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))


def _versioned_scenario(raw: dict[str, Any]) -> ScenarioVersion:
    stages = [
        StageVersion(
            **SOVEREIGN,
            id=stage["id"],
            sequence=stage["sequence"],
            terminal=stage["terminal"],
            agent_message=stage["agent_message"],
            choices=[
                ChoiceVersion(
                    **SOVEREIGN,
                    id=choice["id"],
                    label=choice["label"],
                    consequence=choice["consequence"],
                    is_correct=choice["is_correct"],
                    framework_rationale=choice["rationale"],
                    next_stage_id=choice["next_stage"],
                    risk_outcome=choice["risk_outcome"],
                    dimension_weights=choice["dimension_weights"],
                    control_refs=choice["control_refs"],
                )
                for choice in stage["choices"]
            ],
        )
        for stage in raw["stages"]
    ]
    return ScenarioVersion(
        **SOVEREIGN,
        scenario_id=raw["slug"],
        version=1,
        status="published",
        entry_stage_id=raw["entry_stage_id"],
        stages=stages,
        provenance=ContentProvenance(
            **SOVEREIGN,
            source_id=raw["slug"],
            source_version="2026.10.25",
            source_uri=f"urn:astra:curriculum:{raw['slug']}:2026.10.25",
            source_hash=raw["content_hash"],
            reviewed_by="Astra Curriculum Review Board",
        ),
        content_hash=raw["content_hash"],
    )


def _loader_rows(raw: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for stage in raw["stages"]:
        choices = stage["choices"] or [None]
        for choice in choices:
            rows.append(
                {
                    "scenario_slug": raw["slug"],
                    "title": raw["title"],
                    "brief": raw["brief"],
                    "track": raw["track"],
                    "frameworks": raw["frameworks"],
                    "difficulty": raw["difficulty"],
                    "scenario_extra": {
                        "version_id": "00000000-0000-0000-0000-000000000001",
                        "version": 1,
                        "content_hash": raw["content_hash"],
                        "source_skill_id": raw["slug"].replace("_", "-"),
                        "source_skill_version": "2026.10.25",
                        "source_review_state": "reviewed",
                        "estimated_minutes": 15,
                        "learning_objectives": ["Make an evidenced decision"],
                    },
                    "stage_slug": stage["id"],
                    "stage_sequence": stage["sequence"],
                    "agent_message": stage["agent_message"],
                    "demands": stage["demands"],
                    "choice_id": choice["id"] if choice else None,
                    "label": choice["label"] if choice else None,
                    "consequence": choice["consequence"] if choice else None,
                    "is_correct": choice["is_correct"] if choice else False,
                    "framework_rationale": choice["rationale"] if choice else None,
                    "choice_extra": (
                        {
                            "next_stage": choice["next_stage"],
                            "risk_outcome": choice["risk_outcome"],
                            "dimension_weights": choice["dimension_weights"],
                            "control_refs": choice["control_refs"],
                        }
                        if choice
                        else {}
                    ),
                }
            )
    return rows


def test_all_nine_scenarios_satisfy_the_versioned_contract() -> None:
    document = _document()
    assert document["reviewed_by"] == "Astra Curriculum Review Board"
    assert document["license"] == "MIT"
    assert len(document["scenarios"]) == 9

    for raw in document["scenarios"]:
        content = {key: value for key, value in raw.items() if key != "content_hash"}
        verify_content_hash(content, raw["content_hash"])
        scenario = _versioned_scenario(raw)
        decision_stages = [stage for stage in scenario.stages if not stage.terminal]
        assert len(decision_stages) >= 3
        assert all(len(stage.choices) == 4 for stage in decision_stages)
        assert all(len(choice.dimension_weights) == 4 for stage in decision_stages for choice in stage.choices)
        assert all(
            max(abs(weight) for weight in choice.dimension_weights.values()) <= 100
            for stage in decision_stages
            for choice in stage.choices
        )
        assert all(stage.agent_message for stage in decision_stages)


def test_evaluation_fixtures_cover_correct_qualified_and_failure_paths() -> None:
    scenarios = {item["slug"]: item for item in _document()["scenarios"]}
    fixtures = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))
    assert {item["scenario_slug"] for item in fixtures["paths"]} == set(scenarios)

    for fixture in fixtures["paths"]:
        raw = scenarios[fixture["scenario_slug"]]
        choices = {
            choice["id"]: choice
            for stage in raw["stages"]
            for choice in stage["choices"]
        }
        assert all(choices[item]["is_correct"] for item in fixture["correct"])
        assert all(
            not choices[item]["is_correct"]
            and choices[item]["risk_outcome"] == "qualified_alternative"
            for item in fixture["qualified_alternative"]
        )
        assert all(
            not choices[item]["is_correct"]
            and choices[item]["risk_outcome"] == "control_failure"
            for item in fixture["failure"]
        )


def test_current_loader_and_transition_helpers_run_every_new_scenario() -> None:
    for raw in _document()["scenarios"]:
        scenario = _rows_to_scenario(_loader_rows(raw))
        assert scenario.slug == raw["slug"]
        assert len(scenario.stages) == 4
        current = scenario.entry_stage
        assert current is not None
        while current.slug != "complete":
            assert len(current.choices) == 4
            choice = current.choices[0]
            assert risk_for_choice(choice.choice_id, list(current.choices)) == "controlled"
            next_stage = stage_after_choice(
                choice.choice_id,
                current.slug,
                list(current.choices),
            )
            current = scenario.stage(next_stage)
            assert current is not None


def test_migration_seeds_governance_without_certification_or_audit_mutation() -> None:
    sql = MIGRATION_PATH.read_text(encoding="utf-8").lower()
    assert "curriculum_reviews" in sql
    assert "curriculum_validation_runs" in sql
    assert "completion is not a certification claim" in sql
    assert "raw_skill_markdown_loaded" in sql
    assert "audit_log" not in sql
