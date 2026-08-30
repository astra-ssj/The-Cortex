# core/control_posture.py — Competency per framework control, derived from
# completed training sessions.
#
# The training loop scores four broad dimensions per session; an organisation
# asks a different question — "are we getting more compliant against this
# control?". This module is the bridge, and it is a derivation rather than a
# stored rollup so no number on the Compliance Overview can drift from the
# sessions that produced it.
#
# Attribution chain: a completed session holds the choices the learner made, each
# choice declares the controls it engages (scenario_choices.control_refs, migration
# 035) and the dimensions it moves (dimension_weights, migration 027), and the
# session's final competency holds the scores those dimensions reached. A control's
# score for a session is therefore the mean of the dimensions that the choices
# touching that control actually moved.
#
# Prose is deliberately not parsed here. core/competency.extract_controls() reads
# the same ref out of "Fails ISO 27001:2022 a.8.2" and "Satisfies ISO 27001:2022
# a.8.2", which cannot support a pass/fail claim about a control.

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from compliance import FrameworkId, get as get_framework
from core.competency import (
    DIMENSIONS,
    GAP_FLOOR,
    HUMAN_LABELS,
    PROVEN_THRESHOLD,
    as_dict,
    dimension_score,
    has_signal,
)

logger = structlog.get_logger(__name__)

STATUS_STRONG = "strong"
STATUS_DEVELOPING = "developing"
STATUS_GAP = "gap"

TERMINAL_STAGE = "complete"


def band(score: int) -> str:
    """
    Band a control score using the same thresholds as the learner ledger.

    Reusing GAP_FLOOR and PROVEN_THRESHOLD is the point: a dimension that reads as
    a gap on the debrief must not read as developing on the org overview.
    """
    if score >= PROVEN_THRESHOLD:
        return STATUS_STRONG
    if score >= GAP_FLOOR:
        return STATUS_DEVELOPING
    return STATUS_GAP


@dataclass(frozen=True)
class ControlPosture:
    """One framework control as demonstrated by the org's completed training."""

    ref: str
    name: str
    competency: int
    status: str
    dimensions: list[str]
    scenario_slug: str | None


@dataclass(frozen=True)
class ChoiceContent:
    """Authored attribution for one choice at one stage."""

    control_refs: frozenset[str]
    dimensions: frozenset[str]
    next_stage: str | None


@dataclass
class ScenarioCatalogue:
    """
    Authored scenario content, indexed for path replay.

    Decisions persist the choice id but not the stage it was made at, so the stage
    has to be reconstructed by walking next_stage from the entry. Guessing instead
    — unioning every stage that offers the same choice id — silently widens the
    dimension set: `least_privilege` moves remediation at the escalation stages but
    not at access_request, so a learner who answered correctly first time and never
    saw those stages would be scored on a dimension they never touched, and land
    below the gap floor for a clean run.
    """

    choices: dict[tuple[str, str, str], ChoiceContent] = field(default_factory=dict)
    entry_stages: dict[str, str] = field(default_factory=dict)
    # Every stage offering a given choice, for sessions whose path cannot be walked.
    by_choice: dict[tuple[str, str], list[ChoiceContent]] = field(default_factory=dict)


_CATALOGUE_SQL = text(
    """
    SELECT s.slug              AS scenario_slug,
           st.slug             AS stage_slug,
           st.sequence         AS stage_sequence,
           c.choice_id         AS choice_id,
           c.control_refs      AS control_refs,
           c.dimension_weights AS dimension_weights,
           c.next_stage        AS next_stage
    FROM scenario_choices c
    JOIN scenario_stages st ON st.id = c.stage_id
    JOIN scenarios s        ON s.id = st.scenario_id
    WHERE s.active
    ORDER BY s.slug, st.sequence, c.display_order
    """
)

# RLS on scenario_sessions is the enforcing control; the explicit org predicate is
# defence in depth, matching _ROLLUP_SQL in api/learning.py.
_SESSIONS_SQL = text(
    """
    SELECT learner_id, scenario, state, competency, updated_at
    FROM scenario_sessions
    WHERE org_id = :org_id
      AND stage = 'complete'
    ORDER BY updated_at ASC
    """
)


def _as_list(value: Any) -> list[Any]:
    """JSONB arrives as a list or a JSON string depending on the driver."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return []
    return list(value) if isinstance(value, list) else []


def _choice_dimensions(weights: Any) -> frozenset[str]:
    """
    Dimensions a choice actually moves.

    A choice with no authored weights predates migration 028 and is graded by the
    compiled-in heuristic, which can touch any dimension — so all four count.
    """
    payload = as_dict(weights)
    moved = frozenset(
        dim
        for dim in DIMENSIONS
        if isinstance(payload.get(dim), (int, float)) and payload.get(dim) != 0
    )
    return moved or frozenset(DIMENSIONS)


async def load_choice_catalogue(db: AsyncSession) -> ScenarioCatalogue:
    """Authored content for every active scenario, indexed for replay."""
    rows = (await db.execute(_CATALOGUE_SQL)).mappings().all()
    catalogue = ScenarioCatalogue()

    for row in rows:
        scenario = str(row["scenario_slug"])
        stage = str(row["stage_slug"])
        choice_id = str(row["choice_id"])
        content = ChoiceContent(
            control_refs=frozenset(str(ref) for ref in _as_list(row["control_refs"])),
            dimensions=_choice_dimensions(row["dimension_weights"]),
            next_stage=str(row["next_stage"]) if row["next_stage"] else None,
        )
        catalogue.choices[(scenario, stage, choice_id)] = content
        catalogue.by_choice.setdefault((scenario, choice_id), []).append(content)
        # Rows arrive ordered by sequence, so the first stage seen is the entry.
        catalogue.entry_stages.setdefault(scenario, stage)

    return catalogue


def coverable_controls(catalogue: ScenarioCatalogue) -> set[str]:
    """
    Controls the active scenario content can exercise at all.

    This is the denominator on the overview. Measuring against all 93 Annex A
    controls would imply the other 78 are merely pending, when no scenario can
    ever assess them.
    """
    return {ref for content in catalogue.choices.values() for ref in content.control_refs}


def _walk_decisions(
    scenario: str,
    decisions: list[Any],
    catalogue: ScenarioCatalogue,
) -> list[ChoiceContent]:
    """
    Resolve each decision to the exact choice the learner took, by replaying the
    authored stage transitions.

    If the path desynchronises — content edited after the session was recorded —
    fall back to the stages that offer that choice id and take only what they
    agree on, so a stale session understates rather than invents attribution.
    """
    stage: str | None = catalogue.entry_stages.get(scenario)
    resolved: list[ChoiceContent] = []

    for decision in decisions:
        if not isinstance(decision, dict):
            continue
        choice_id = str(decision.get("choice") or "")
        if not choice_id:
            continue

        content = catalogue.choices.get((scenario, stage, choice_id)) if stage else None
        if content is None:
            candidates = catalogue.by_choice.get((scenario, choice_id), [])
            if not candidates:
                continue
            content = ChoiceContent(
                control_refs=frozenset.intersection(*(c.control_refs for c in candidates)),
                dimensions=frozenset.intersection(*(c.dimensions for c in candidates)),
                next_stage=None,
            )
            logger.debug(
                "control_posture_path_desync",
                scenario=scenario,
                stage=stage,
                choice=choice_id,
            )
            stage = None
        else:
            stage = content.next_stage

        resolved.append(content)
        if stage == TERMINAL_STAGE:
            stage = None

    return resolved


def _session_control_scores(
    session: dict[str, Any],
    catalogue: ScenarioCatalogue,
) -> dict[str, tuple[int, frozenset[str]]]:
    """Score every control this one session exercised, with the dimensions behind it."""
    competency = session.get("competency")
    if not has_signal(competency):
        return {}

    scenario = str(session.get("scenario") or "")
    state = as_dict(session.get("state"))

    per_control: dict[str, set[str]] = {}
    for content in _walk_decisions(scenario, _as_list(state.get("decisions")), catalogue):
        for ref in content.control_refs:
            per_control.setdefault(ref, set()).update(content.dimensions)

    scored: dict[str, tuple[int, frozenset[str]]] = {}
    for ref, dims in per_control.items():
        if not dims:
            continue
        mean = sum(dimension_score(competency, dim) for dim in dims) / len(dims)
        scored[ref] = (round(mean), frozenset(dims))
    return scored


def derive_control_posture(
    sessions: list[dict[str, Any]],
    catalogue: ScenarioCatalogue,
    framework_id: FrameworkId,
) -> list[ControlPosture]:
    """
    Roll completed sessions up into one posture row per assessed control.

    Each learner contributes their latest score for a control, because competency
    is a current capability claim rather than a running average. Those latest
    scores are then averaged across learners: one person's bad run must not erase
    what the team has demonstrated, and one strong run must not mask a weak team.

    Sessions must be ordered oldest-first.
    """
    framework = get_framework(framework_id)
    if framework is None:
        return []
    names = {control.id: control.name for control in framework.controls}

    latest_by_learner: dict[tuple[str, str], int] = {}
    dims_by_control: dict[str, set[str]] = {}
    scenario_by_control: dict[str, str] = {}

    for session in sessions:
        learner = str(session.get("learner_id") or "")
        scenario = str(session.get("scenario") or "")
        for ref, (score, dims) in _session_control_scores(session, catalogue).items():
            if ref not in names:
                # Authored against a control this framework does not define. Skip it
                # rather than invent a row; the migration test catches the content bug.
                logger.warning(
                    "control_ref_not_in_framework",
                    control_ref=ref,
                    framework_id=framework_id.value,
                    scenario=scenario,
                )
                continue
            latest_by_learner[(learner, ref)] = score
            dims_by_control.setdefault(ref, set()).update(dims)
            if scenario:
                scenario_by_control[ref] = scenario

    scores_by_control: dict[str, list[int]] = {}
    for (_learner, ref), score in latest_by_learner.items():
        scores_by_control.setdefault(ref, []).append(score)

    posture = [
        ControlPosture(
            ref=ref,
            name=names[ref],
            competency=round(sum(learner_scores) / len(learner_scores)),
            status=band(round(sum(learner_scores) / len(learner_scores))),
            dimensions=[
                HUMAN_LABELS[dim] for dim in DIMENSIONS if dim in dims_by_control.get(ref, set())
            ],
            scenario_slug=scenario_by_control.get(ref),
        )
        for ref, learner_scores in scores_by_control.items()
    ]
    posture.sort(key=_ref_sort_key)
    return posture


def _ref_sort_key(item: ControlPosture) -> tuple[int, int, int, str]:
    """
    Sort A.5.9 before A.5.12, which a plain string sort inverts, and keep the
    management clauses after Annex A.
    """
    parts = item.ref.split(".")
    if parts[0] == "clause":
        head = 1
        rest = parts[1:]
    else:
        head = 0
        rest = parts[1:] if parts[0].startswith("a") else parts

    def num(index: int) -> int:
        try:
            return int(rest[index])
        except (IndexError, ValueError):
            return 0

    return (head, num(0), num(1), item.ref)


def not_assessed_controls(
    assessed: set[str],
    coverable: set[str],
    framework_id: FrameworkId,
) -> list[dict[str, str]]:
    """Coverable controls no completed session has exercised yet."""
    framework = get_framework(framework_id)
    if framework is None:
        return []
    names = {control.id: control.name for control in framework.controls}
    rows = [
        {"ref": ref, "name": names[ref]}
        for ref in coverable - assessed
        if ref in names
    ]
    rows.sort(key=lambda row: _ref_sort_key(ControlPosture(row["ref"], "", 0, "", [], None)))
    return rows


async def load_completed_sessions(db: AsyncSession, org_id: str) -> list[dict[str, Any]]:
    """Completed sessions for one org, oldest-first. Caller must bind the tenant first."""
    rows = (await db.execute(_SESSIONS_SQL, {"org_id": org_id})).mappings().all()
    return [dict(row) for row in rows]
