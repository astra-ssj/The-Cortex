from __future__ import annotations

import json
from pathlib import Path

from core.practice_quality import audit_catalog, audit_practice

ROOT = Path(__file__).resolve().parents[1]


def _practice() -> dict[str, object]:
    return {
        "id": "evidence-review",
        "scenario_slug": "evidence_review",
        "difficulty": "foundation",
        "learning_objectives": ["Inspect evidence", "Test provenance", "Escalate gaps"],
        "target_dimensions": ["evidence", "escalation"],
        "review_state": "reviewed",
        "jurisdiction": "international",
    }


def _choice(choice_id: str, outcome: str, target: str) -> dict[str, object]:
    return {
        "id": choice_id,
        "consequence": f"{choice_id} creates a specific, attributable control consequence.",
        "rationale": f"{choice_id} is evaluated against retained evidence and the named control objective.",
        "risk_outcome": outcome,
        "next_stage": target,
    }


def test_quality_gate_accepts_branched_fully_evaluated_practice() -> None:
    scenario = {
        "slug": "evidence_review",
        "stages": [
            {
                "id": "inspect",
                "terminal": False,
                "choices": [
                    _choice("retain", "controlled", "verify"),
                    _choice("condition", "qualified_alternative", "verify"),
                    _choice("accept", "control_failure", "complete"),
                    _choice("wait", "unmanaged_delay", "complete"),
                ],
            },
            {
                "id": "verify",
                "terminal": False,
                "choices": [
                    _choice("reperform", "controlled", "escalate"),
                    _choice("sample", "qualified_alternative", "escalate"),
                    _choice("assume", "control_failure", "complete"),
                    _choice("defer", "unmanaged_delay", "complete"),
                ],
            },
            {
                "id": "escalate",
                "terminal": False,
                "choices": [
                    _choice("record", "controlled", "complete"),
                    _choice("condition-close", "qualified_alternative", "complete"),
                    _choice("delete", "control_failure", "complete"),
                    _choice("ignore", "unmanaged_delay", "complete"),
                ],
            },
            {"id": "complete", "terminal": True, "choices": []},
        ],
    }
    fixture = {
        "scenario_slug": "evidence_review",
        "correct": ["retain", "reperform", "record"],
        "qualified_alternative": ["condition", "sample", "condition-close"],
        "failure": ["accept"],
        "defer": ["wait"],
        "mixed": ["retain", "sample", "record"],
    }

    report = audit_practice(_practice(), scenario=scenario, fixture=fixture)

    assert report.passes is True
    assert report.score == 100
    assert report.findings == []


def test_quality_gate_detects_linear_and_incomplete_fixture() -> None:
    scenario = {
        "slug": "evidence_review",
        "stages": [
            {
                "id": stage_id,
                "terminal": False,
                "choices": [
                    _choice(f"{stage_id}-{kind}", outcome, "complete")
                    for kind, outcome in (
                        ("correct", "controlled"),
                        ("qualified", "qualified_alternative"),
                        ("failure", "control_failure"),
                        ("defer", "unmanaged_delay"),
                    )
                ],
            }
            for stage_id in ("one", "two", "three")
        ]
        + [{"id": "complete", "terminal": True, "choices": []}],
    }

    report = audit_practice(
        _practice(),
        scenario=scenario,
        fixture={"correct": [], "qualified_alternative": [], "failure": []},
    )

    assert report.passes is False
    assert {finding.code for finding in report.findings} == {
        "branching.linear_only",
        "fixtures.incomplete",
    }


def test_all_launch_practices_are_in_quality_baseline() -> None:
    catalog = json.loads((ROOT / "content/practices/index.json").read_text())
    scenarios = json.loads((ROOT / "content/practices/scenarios_v1_1.json").read_text())
    fixtures = json.loads((ROOT / "content/practices/evaluation_fixtures_v2.json").read_text())

    reports = audit_catalog(
        catalog["practices"],
        scenarios["scenarios"],
        fixtures["paths"],
    )

    assert len(reports) == 15
    assert {report.practice_id for report in reports} == {
        item["id"] for item in catalog["practices"]
    }
    assert all(report.passes for report in reports)
    assert all(report.score == 100 for report in reports)
