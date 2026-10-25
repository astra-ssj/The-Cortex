"""Deterministic curriculum quality gates for reviewed Astra practices."""

from __future__ import annotations

from collections import Counter
from typing import Any, Literal

from pydantic import Field

from core.governance import SovereignModel

Severity = Literal["error", "warning"]
QUALITY_STANDARD_VERSION = "practice-quality-v1"
PASSING_SCORE = 85


class QualityFinding(SovereignModel):
    code: str
    severity: Severity
    message: str

    model_config = {"extra": "forbid", "frozen": True}


class PracticeQualityReport(SovereignModel):
    practice_id: str
    scenario_slug: str | None
    standard_version: str = QUALITY_STANDARD_VERSION
    score: int = Field(..., ge=0, le=100)
    passes: bool
    findings: list[QualityFinding] = Field(default_factory=list)

    model_config = {"extra": "forbid", "frozen": True}


def _finding(code: str, message: str, *, severity: Severity = "error") -> QualityFinding:
    return QualityFinding(
        jurisdiction="international",
        purpose_tags=["learning", "curriculum-quality"],
        code=code,
        severity=severity,
        message=message,
    )


def audit_practice(
    practice: dict[str, Any],
    *,
    scenario: dict[str, Any] | None,
    fixture: dict[str, Any] | None,
) -> PracticeQualityReport:
    """Evaluate metadata, decision design, grading paths and remediation coverage."""
    findings: list[QualityFinding] = []
    objectives = [str(value) for value in practice.get("learning_objectives", [])]
    dimensions = [str(value) for value in practice.get("target_dimensions", [])]
    if len(objectives) < 3:
        findings.append(_finding("objectives.too_few", "At least three learning objectives are required."))
    if len(set(dimensions)) < 2:
        findings.append(
            _finding("dimensions.too_narrow", "A practice must assess at least two competency dimensions.")
        )
    if practice.get("review_state") != "reviewed":
        findings.append(_finding("review.not_approved", "Only reviewed practices can pass the quality gate."))

    if scenario is None:
        findings.append(
            _finding(
                "scenario.not_source_auditable",
                "The published scenario is not available in the canonical quality source.",
            )
        )
    else:
        decision_stages = [stage for stage in scenario.get("stages", []) if not stage.get("terminal")]
        minimum_stages = {
            "foundation": 2,
            "practitioner": 3,
            "expert": 4,
        }.get(str(practice.get("difficulty")), 3)
        if len(decision_stages) < minimum_stages:
            findings.append(
                _finding(
                    "difficulty.insufficient_depth",
                    f"{practice.get('difficulty')} practices require at least {minimum_stages} decision stages.",
                )
            )
        if len(decision_stages) < len(objectives):
            findings.append(
                _finding(
                    "objectives.not_covered",
                    "Every learning objective requires a distinct assessed stage.",
                )
            )

        outcome_counts: Counter[str] = Counter()
        has_meaningful_branch = False
        consequences: list[str] = []
        for stage in decision_stages:
            choices = list(stage.get("choices", []))
            targets = {str(choice.get("next_stage") or "") for choice in choices}
            has_meaningful_branch = has_meaningful_branch or len(targets) > 1
            if len(choices) < 3:
                findings.append(
                    _finding(
                        "choices.too_few",
                        f"Stage {stage.get('id')} requires at least three plausible decisions.",
                    )
                )
            for choice in choices:
                outcome_counts[str(choice.get("risk_outcome") or "")] += 1
                consequence = str(choice.get("consequence") or "").strip()
                consequences.append(consequence)
                if len(consequence) < 25:
                    findings.append(
                        _finding(
                            "consequence.too_thin",
                            f"Choice {choice.get('id')} requires a concrete consequence.",
                        )
                    )
                if len(str(choice.get("rationale") or "").strip()) < 40:
                    findings.append(
                        _finding(
                            "rationale.too_thin",
                            f"Choice {choice.get('id')} requires framework-grounded rationale.",
                        )
                    )
        if not has_meaningful_branch:
            findings.append(
                _finding(
                    "branching.linear_only",
                    "At least one decision must change the subsequent scenario path.",
                )
            )
        required_outcomes = {
            "controlled",
            "qualified_alternative",
            "control_failure",
            "unmanaged_delay",
        }
        if not required_outcomes.issubset(outcome_counts):
            findings.append(
                _finding(
                    "grading.missing_class",
                    "Correct, qualified, failure and defer outcomes must all be represented.",
                )
            )
        if consequences and len(set(consequences)) < max(3, len(consequences) // 2):
            findings.append(
                _finding(
                    "consequence.over_reused",
                    "Consequences are repeated too often to reflect scenario-specific impact.",
                )
            )

    required_fixture_paths = {
        "correct",
        "qualified_alternative",
        "failure",
        "defer",
        "mixed",
    }
    if fixture is None:
        findings.append(_finding("fixtures.missing", "Evaluation paths are required for every practice."))
    else:
        missing = sorted(required_fixture_paths - set(fixture))
        if missing:
            findings.append(
                _finding(
                    "fixtures.incomplete",
                    f"Evaluation fixtures are missing paths: {', '.join(missing)}.",
                )
            )

    penalty = sum(15 if finding.severity == "error" else 5 for finding in findings)
    score = max(0, 100 - penalty)
    return PracticeQualityReport(
        jurisdiction=str(practice.get("jurisdiction") or "international"),
        purpose_tags=["learning", "curriculum-quality"],
        practice_id=str(practice.get("id") or ""),
        scenario_slug=(
            str(practice["scenario_slug"]) if practice.get("scenario_slug") else None
        ),
        score=score,
        passes=score >= PASSING_SCORE and not any(
            finding.severity == "error" for finding in findings
        ),
        findings=findings,
    )


def audit_catalog(
    practices: list[dict[str, Any]],
    scenarios: list[dict[str, Any]],
    fixtures: list[dict[str, Any]],
) -> list[PracticeQualityReport]:
    by_scenario = {str(item.get("slug")): item for item in scenarios}
    by_fixture = {str(item.get("scenario_slug")): item for item in fixtures}
    return [
        audit_practice(
            practice,
            scenario=by_scenario.get(str(practice.get("scenario_slug"))),
            fixture=by_fixture.get(str(practice.get("scenario_slug"))),
        )
        for practice in practices
    ]
