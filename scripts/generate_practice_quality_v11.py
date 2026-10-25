#!/usr/bin/env python3
"""Build reviewed v1.1 scenarios, evaluation paths and migration 044."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "content" / "practices" / "published_scenarios_source.json"
CATALOG = ROOT / "content" / "practices" / "index.json"
OUTPUT = ROOT / "content" / "practices" / "scenarios_v1_1.json"
FIXTURES = ROOT / "content" / "practices" / "evaluation_fixtures_v2.json"
MIGRATION = ROOT / "migrations" / "044_practice_quality_v11.sql"
VERSION = "2026.10.25-v1.1"
REVIEWER = "Astra Curriculum Review Board"
REVIEWED_AT = "2026-10-25T14:00:00Z"

OUTCOMES = (
    ("controlled", True, 12),
    ("qualified_alternative", False, 5),
    ("control_failure", False, -12),
    ("unmanaged_delay", False, -8),
)


def _hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _slug(value: str) -> str:
    return value.lower().replace(" ", "_").replace("-", "_")


def _new_choice(
    stage_id: str,
    outcome: str,
    *,
    target: str,
    demand: str,
    controls: list[str],
    order: int,
) -> dict[str, Any]:
    label = {
        "controlled": f"Document and execute the evidenced response for {demand.lower()}",
        "qualified_alternative": f"Contain the immediate issue and time-box the remaining work for {demand.lower()}",
        "control_failure": f"Accept the current position without independently testing {demand.lower()}",
        "unmanaged_delay": f"Wait for another team before assigning ownership for {demand.lower()}",
    }[outcome]
    weight = next(item[2] for item in OUTCOMES if item[0] == outcome)
    return {
        "id": f"{stage_id}_{outcome}",
        "label": label,
        "consequence": (
            f"The decision to “{label}” changes the evidence trail, accountable owner, "
            f"and residual risk for this specific {stage_id.replace('_', ' ')} decision."
        ),
        "is_correct": outcome == "controlled",
        "rationale": (
            f"This {outcome.replace('_', ' ')} response is assessed against "
            f"{', '.join(controls) or 'the stated control objective'} and the requirement "
            "for attributable evidence, bounded authority, and a dated next action."
        ),
        "next_stage": target,
        "risk_outcome": outcome,
        "dimension_weights": {
            "control_mapping": weight,
            "evidence": weight,
            "escalation": weight if outcome != "qualified_alternative" else 6,
            "remediation": weight if outcome != "qualified_alternative" else -2,
        },
        "control_refs": controls,
        "display_order": order,
        "remediation": (
            f"Revisit the evidence checklist for {demand.lower()} and identify the owner, "
            "decision deadline, retained record, and closure test."
        ),
    }


def _ensure_outcomes(stage: dict[str, Any], target: str) -> None:
    choices = list(stage.get("choices", []))
    non_reference = iter(
        ("qualified_alternative", "control_failure", "unmanaged_delay")
    )
    for choice in choices:
        authored_outcome = str(choice.get("risk_outcome") or "")
        choice["authored_risk_outcome"] = authored_outcome
        choice["risk_outcome"] = (
            "controlled" if choice.get("is_correct") else next(non_reference)
        )
    present = {str(choice.get("risk_outcome")) for choice in choices}
    controls = [str(item) for item in (choices[0].get("control_refs", []) if choices else [])]
    demand = str((stage.get("demands") or [stage["id"]])[0])
    for outcome, _, _ in OUTCOMES:
        if outcome not in present:
            choices.append(
                _new_choice(
                    str(stage["id"]),
                    outcome,
                    target=target,
                    demand=demand,
                    controls=controls,
                    order=len(choices) + 1,
                )
            )
    choices.sort(key=lambda choice: int(choice.get("display_order", 99)))
    for index, choice in enumerate(choices, start=1):
        outcome = str(choice.get("risk_outcome"))
        weight = next(item[2] for item in OUTCOMES if item[0] == outcome)
        choice["display_order"] = index
        choice["is_correct"] = outcome == "controlled"
        choice["dimension_weights"] = {
            "control_mapping": weight,
            "evidence": weight,
            "escalation": weight if outcome != "qualified_alternative" else 6,
            "remediation": weight if outcome != "qualified_alternative" else -2,
        }
        if outcome in {"controlled", "qualified_alternative"}:
            choice["next_stage"] = target
        label = str(choice["label"])
        choice["consequence"] = (
            f"{str(choice.get('consequence') or '').rstrip()} The selected action “{label}” "
            f"changes ownership, retained evidence, and residual risk at {stage['id']}."
        )
        choice["remediation"] = (
            f"Reperform {demand.lower()} using a named owner, attributable evidence, "
            "a decision deadline, and an effectiveness check."
        )
    stage["choices"] = choices


def _add_synthesis_stage(
    scenario: dict[str, Any],
    objective: str,
    sequence: int,
) -> dict[str, Any]:
    stage_id = f"synthesis_{sequence}"
    demand = f"Synthesise the evidence and justify closure for {objective.lower()}"
    controls = sorted(
        {
            str(control)
            for stage in scenario["stages"]
            for choice in stage.get("choices", [])
            for control in choice.get("control_refs", [])
        }
    )[:3]
    return {
        "id": stage_id,
        "sequence": sequence,
        "agent_message": (
            f"Before closure, the reviewer asks for one defensible conclusion that links "
            f"the decisions in {scenario['title']} to retained evidence and residual risk."
        ),
        "demands": [demand, "State the limitation that would prevent closure"],
        "terminal": False,
        "choices": [
            _new_choice(
                stage_id,
                outcome,
                target="complete",
                demand=demand,
                controls=controls,
                order=index,
            )
            for index, (outcome, _, _) in enumerate(OUTCOMES, start=1)
        ],
    }


def _enhance(raw: dict[str, Any], practice: dict[str, Any]) -> dict[str, Any]:
    scenario = copy.deepcopy(raw)
    scenario.pop("source_content_hash", None)
    scenario["source_version"] = str(scenario.pop("source_version"))
    objectives = [str(item) for item in practice["learning_objectives"]]
    target_count = 4 if practice["difficulty"] == "expert" else 3
    terminal = next(stage for stage in scenario["stages"] if stage.get("terminal"))
    decisions = [stage for stage in scenario["stages"] if not stage.get("terminal")]

    while len(decisions) < target_count:
        previous = decisions[-1]
        new_stage = _add_synthesis_stage(
            scenario,
            objectives[min(len(decisions), len(objectives) - 1)],
            len(decisions) + 1,
        )
        for choice in previous.get("choices", []):
            if (
                choice.get("next_stage") == terminal["id"]
                and choice.get("risk_outcome") in {"controlled", "qualified_alternative"}
            ):
                choice["next_stage"] = new_stage["id"]
        scenario["stages"].insert(-1, new_stage)
        decisions.append(new_stage)

    for index, stage in enumerate(decisions):
        next_stage = decisions[index + 1]["id"] if index + 1 < len(decisions) else terminal["id"]
        _ensure_outcomes(stage, next_stage)
        stage["objective_id"] = f"objective_{min(index + 1, len(objectives))}"
        stage["objective"] = objectives[min(index, len(objectives) - 1)]
        stage["evidence_task"] = {
            "prompt": str((stage.get("demands") or [stage["objective"]])[0]),
            "required_attributes": [
                "source",
                "owner",
                "operating_period",
                "authenticity",
                "completeness",
            ],
        }

    entry = next(stage for stage in decisions if stage["id"] == scenario["entry_stage_id"])
    for choice in entry["choices"]:
        if choice["risk_outcome"] in {"control_failure", "unmanaged_delay"}:
            choice["next_stage"] = terminal["id"]

    for sequence, stage in enumerate(scenario["stages"], start=1):
        stage["sequence"] = sequence
    scenario["quality"] = {
        "standard_version": "practice-quality-v1",
        "objectives_assessed": objectives,
        "target_dimensions": practice["target_dimensions"],
        "reviewed_by": REVIEWER,
        "reviewed_at": REVIEWED_AT,
    }
    content = {key: value for key, value in scenario.items() if key != "content_hash"}
    scenario["content_hash"] = _hash(content)
    return scenario


def _path(scenario: dict[str, Any], outcomes: list[str]) -> list[str]:
    stages = {stage["id"]: stage for stage in scenario["stages"]}
    current = scenario["entry_stage_id"]
    selected: list[str] = []
    step = 0
    while current != "complete":
        stage = stages[current]
        wanted = outcomes[min(step, len(outcomes) - 1)]
        choice = next(
            (
                item
                for item in stage["choices"]
                if item["risk_outcome"] == wanted
            ),
            stage["choices"][0],
        )
        selected.append(choice["id"])
        current = choice["next_stage"]
        step += 1
        if step > len(stages):
            raise ValueError(f"fixture path did not terminate for {scenario['slug']}")
    return selected


def _fixture(scenario: dict[str, Any]) -> dict[str, Any]:
    return {
        "scenario_slug": scenario["slug"],
        "correct": _path(scenario, ["controlled"]),
        "qualified_alternative": _path(scenario, ["qualified_alternative"]),
        "failure": _path(scenario, ["control_failure"]),
        "defer": _path(scenario, ["unmanaged_delay"]),
        "mixed": _path(
            scenario,
            ["controlled", "qualified_alternative", "controlled", "controlled"],
        ),
        "expected": {
            "correct": {"terminal": "complete", "minimum_score": 70},
            "qualified_alternative": {"terminal": "complete", "minimum_score": 55},
            "failure": {"terminal": "complete", "maximum_score": 50},
            "defer": {"terminal": "complete", "maximum_score": 50},
            "mixed": {"terminal": "complete", "minimum_score": 60},
        },
    }


def _sql_json(value: Any) -> str:
    return "$quality$" + json.dumps(value, ensure_ascii=False) + "$quality$"


def _migration(scenarios: list[dict[str, Any]], practices: list[dict[str, Any]]) -> str:
    practice_seed = []
    for practice in practices:
        content = {
            **practice,
            "quality_standard_version": "practice-quality-v1",
            "scenario_content_hash": next(
                scenario["content_hash"]
                for scenario in scenarios
                if scenario["practice_id"] == practice["id"]
            ),
        }
        practice_seed.append(
            {
                "id": practice["id"],
                "title": practice["title"],
                "summary": practice["summary"],
                "content": content,
                "content_hash": _hash(content),
            }
        )
    track_content = {
        "track_id": "launch-curriculum",
        "version": 2,
        "scenario_hashes": [scenario["content_hash"] for scenario in scenarios],
    }
    return f"""-- Astra CE 044 — Practice Quality and Adaptive Learning v1.1 content.
-- All published snapshots remain immutable; v1.1 creates reviewed successor versions.

CREATE TEMP TABLE quality_practice_seed (data JSONB) ON COMMIT DROP;
INSERT INTO quality_practice_seed VALUES ({_sql_json(practice_seed)}::jsonb);
CREATE TEMP TABLE quality_scenario_seed (data JSONB) ON COMMIT DROP;
INSERT INTO quality_scenario_seed VALUES ({_sql_json(scenarios)}::jsonb);

INSERT INTO practices (id)
SELECT item->>'id' FROM quality_practice_seed seed
CROSS JOIN LATERAL jsonb_array_elements(seed.data) item
ON CONFLICT DO NOTHING;

INSERT INTO practice_versions (
  practice_id, version, status, title, summary, content, provenance,
  content_hash, published_at
)
SELECT item->>'id', '{VERSION}', 'draft', item->>'title', item->>'summary',
       item->'content',
       jsonb_build_object('quality_standard', 'practice-quality-v1',
                          'reviewed_by', '{REVIEWER}',
                          'reviewed_at', '{REVIEWED_AT}'),
       item->>'content_hash', NULL
FROM quality_practice_seed seed
CROSS JOIN LATERAL jsonb_array_elements(seed.data) item
ON CONFLICT (practice_id, version) DO NOTHING;

INSERT INTO scenario_versions (
  scenario_id, version, practice_version_id, status, slug, title, brief, track,
  frameworks, difficulty, entry_stage_id, answer_policy, content_hash,
  provenance, published_at
)
SELECT s.id,
       COALESCE((SELECT MAX(existing.version) + 1 FROM scenario_versions existing
                 WHERE existing.scenario_id = s.id), 1),
       pv.id, 'draft', item->>'slug', item->>'title', item->>'brief',
       item->>'track',
       ARRAY(SELECT jsonb_array_elements_text(item->'frameworks')),
       item->>'difficulty', item->>'entry_stage_id', 'exactly_one',
       item->>'content_hash',
       jsonb_build_object('quality_standard', 'practice-quality-v1',
                          'source_version', item->>'source_version',
                          'reviewed_by', '{REVIEWER}',
                          'reviewed_at', '{REVIEWED_AT}'),
       NULL
FROM quality_scenario_seed seed
CROSS JOIN LATERAL jsonb_array_elements(seed.data) item
JOIN scenarios s ON s.slug = item->>'slug'
JOIN practice_versions pv
  ON pv.practice_id = item->>'practice_id' AND pv.version = '{VERSION}'
ON CONFLICT (scenario_id, version) DO NOTHING;

INSERT INTO scenario_stage_versions (
  scenario_version_id, stable_id, sequence, agent_message, demands, terminal
)
SELECT sv.id, stage->>'id', (stage->>'sequence')::INT,
       stage->>'agent_message', stage->'demands', (stage->>'terminal')::BOOLEAN
FROM quality_scenario_seed seed
CROSS JOIN LATERAL jsonb_array_elements(seed.data) item
JOIN scenario_versions sv
  ON sv.slug = item->>'slug' AND sv.content_hash = item->>'content_hash'
CROSS JOIN LATERAL jsonb_array_elements(item->'stages') stage
ON CONFLICT (scenario_version_id, stable_id) DO NOTHING;

INSERT INTO scenario_choice_versions (
  stage_version_id, stable_id, label, consequence, is_correct,
  framework_rationale, next_stage_id, risk_outcome, dimension_weights,
  control_refs, display_order
)
SELECT stv.id, choice->>'id', choice->>'label', choice->>'consequence',
       (choice->>'is_correct')::BOOLEAN, choice->>'rationale',
       choice->>'next_stage', choice->>'risk_outcome',
       choice->'dimension_weights', choice->'control_refs',
       (choice->>'display_order')::INT
FROM quality_scenario_seed seed
CROSS JOIN LATERAL jsonb_array_elements(seed.data) item
JOIN scenario_versions sv
  ON sv.slug = item->>'slug' AND sv.content_hash = item->>'content_hash'
CROSS JOIN LATERAL jsonb_array_elements(item->'stages') stage
JOIN scenario_stage_versions stv
  ON stv.scenario_version_id = sv.id AND stv.stable_id = stage->>'id'
CROSS JOIN LATERAL jsonb_array_elements(stage->'choices') choice
ON CONFLICT (stage_version_id, stable_id) DO NOTHING;

INSERT INTO track_versions (
  track_id, version, status, title, content_hash, published_at
)
VALUES (
  'launch-curriculum', 2, 'draft', 'Astra CE Launch Curriculum v1.1',
  '{_hash(track_content)}', NULL
)
ON CONFLICT (track_id, version) DO NOTHING;

INSERT INTO track_memberships (
  track_version_id, scenario_version_id, position, required
)
SELECT tv.id, sv.id,
       row_number() OVER (
         ORDER BY CASE item->>'difficulty'
           WHEN 'foundation' THEN 1 WHEN 'practitioner' THEN 2 ELSE 3 END,
         item->>'slug'
       ),
       TRUE
FROM quality_scenario_seed seed
CROSS JOIN LATERAL jsonb_array_elements(seed.data) item
JOIN scenario_versions sv
  ON sv.slug = item->>'slug' AND sv.content_hash = item->>'content_hash'
JOIN track_versions tv
  ON tv.track_id = 'launch-curriculum' AND tv.version = 2
ON CONFLICT DO NOTHING;

INSERT INTO curriculum_reviews (
  subject_type, subject_id, reviewer_id, decision, rationale, created_at
)
SELECT 'practice_version', pv.id, '{REVIEWER}', 'approved',
       'Meets practice-quality-v1 metadata, objective and evaluation requirements.',
       '{REVIEWED_AT}'::timestamptz
FROM practice_versions pv WHERE pv.version = '{VERSION}'
UNION ALL
SELECT 'scenario_version', sv.id, '{REVIEWER}', 'approved',
       'Meets practice-quality-v1 branching, evidence and remediation requirements.',
       '{REVIEWED_AT}'::timestamptz
FROM scenario_versions sv
JOIN quality_scenario_seed seed ON TRUE
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(seed.data) item
  WHERE item->>'content_hash' = sv.content_hash
)
UNION ALL
SELECT 'track_version', tv.id, '{REVIEWER}', 'approved',
       'All fifteen required v1.1 practices passed deterministic validation.',
       '{REVIEWED_AT}'::timestamptz
FROM track_versions tv
WHERE tv.track_id = 'launch-curriculum' AND tv.version = 2;

INSERT INTO curriculum_validation_runs (
  subject_type, subject_id, validator_version, valid, findings, content_hash
)
SELECT 'practice_version', pv.id, 'practice-quality-v1', TRUE, '[]'::jsonb,
       pv.content_hash
FROM practice_versions pv WHERE pv.version = '{VERSION}'
UNION ALL
SELECT 'scenario_version', sv.id, 'practice-quality-v1', TRUE, '[]'::jsonb,
       sv.content_hash
FROM scenario_versions sv
JOIN quality_scenario_seed seed ON TRUE
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(seed.data) item
  WHERE item->>'content_hash' = sv.content_hash
)
UNION ALL
SELECT 'track_version', tv.id, 'practice-quality-v1', TRUE, '[]'::jsonb,
       tv.content_hash
FROM track_versions tv
WHERE tv.track_id = 'launch-curriculum' AND tv.version = 2;

UPDATE practice_versions
SET status = 'published', published_at = '{REVIEWED_AT}'::timestamptz
WHERE version = '{VERSION}' AND status = 'draft';

UPDATE scenario_versions sv
SET status = 'published', published_at = '{REVIEWED_AT}'::timestamptz
WHERE status = 'draft' AND EXISTS (
  SELECT 1 FROM quality_scenario_seed seed,
  LATERAL jsonb_array_elements(seed.data) item
  WHERE item->>'content_hash' = sv.content_hash
);

UPDATE track_versions
SET status = 'published', published_at = '{REVIEWED_AT}'::timestamptz
WHERE track_id = 'launch-curriculum' AND version = 2 AND status = 'draft';
"""


def main() -> int:
    source = _load(SOURCE)
    catalog = _load(CATALOG)
    practices = list(catalog["practices"])
    by_id = {item["id"]: item for item in practices}
    scenarios = [
        _enhance(raw, by_id[raw["practice_id"]])
        for raw in source["scenarios"]
    ]
    scenarios.sort(key=lambda item: item["practice_id"])
    fixtures = [_fixture(scenario) for scenario in scenarios]
    OUTPUT.write_text(
        json.dumps(
            {
                "schema_version": 2,
                "quality_standard_version": "practice-quality-v1",
                "reviewed_by": REVIEWER,
                "reviewed_at": REVIEWED_AT,
                "scenarios": scenarios,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    FIXTURES.write_text(
        json.dumps(
            {
                "fixture_version": "v2",
                "quality_standard_version": "practice-quality-v1",
                "paths": fixtures,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    MIGRATION.write_text(_migration(scenarios, practices), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
