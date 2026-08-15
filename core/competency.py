# core/competency.py — Shared competency vocabulary, thresholds and rollups.
#
# One definition of "how good is this learner" for the whole platform. The
# debrief, the Control Gaps generator, the learner ledger and the org ledger all
# read from here, because a dimension that counts as a gap on one screen and as a
# pass on another destroys the credibility of every number in the product.
#
# Scores live as JSONB on scenario_sessions.competency (migration 020), keyed by
# dimension: {"score": int, "delta": -1|0|1, "observations": [str]}.
# Per-decision point deltas are content, not code — see migration 027.

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

DIMENSIONS: tuple[str, ...] = (
    "control_mapping",
    "evidence",
    "escalation",
    "remediation",
)

HUMAN_LABELS: dict[str, str] = {
    "control_mapping": "Control mapping",
    "evidence": "Evidence quality",
    "escalation": "Escalation judgment",
    "remediation": "Remediation",
}

# Every dimension starts here, so an untouched dimension is indistinguishable
# from a deliberately average one. Treat 50 as "no signal", never as a pass.
START_SCORE = 50

# Below this, the dimension becomes a Control Gap the learner has to work off.
GAP_FLOOR = 60

# At or above this the dimension counts toward track completion, but only once
# it has been demonstrated in MIN_SCENARIOS_FOR_PROVEN distinct scenarios — one
# lucky run is not mastery.
PROVEN_THRESHOLD = 70
MIN_SCENARIOS_FOR_PROVEN = 2

TERMINAL_STAGE = "complete"

# Authors write control references into framework_rationale ("... ISO 27001:2022
# A.5.20 (supplier agreements) ..."), which is the only place they exist in the
# content model. Annex A ids are A.<clause>.<control>; management-system clauses
# appear as bare "clause 10" and are matched separately.
_ANNEX_A = re.compile(r"\bA\.(\d{1,2})\.(\d{1,2})\b", re.IGNORECASE)
_CLAUSE = re.compile(r"\bclause\s+(\d{1,2})\b", re.IGNORECASE)


def as_dict(value: Any) -> dict[str, Any]:
    """JSONB arrives as a dict or a JSON string depending on the driver."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return {}
    return dict(value) if isinstance(value, dict) else {}


def dimension_score(competency: Any, dimension: str) -> int:
    """Score for one dimension, defaulting to the neutral start."""
    payload = as_dict(competency).get(dimension)
    if not isinstance(payload, dict):
        return START_SCORE
    try:
        return max(0, min(100, int(payload.get("score", START_SCORE))))
    except (TypeError, ValueError):
        return START_SCORE


def dimension_observations(competency: Any, dimension: str) -> list[str]:
    payload = as_dict(competency).get(dimension)
    if not isinstance(payload, dict):
        return []
    raw = payload.get("observations")
    return [str(item) for item in raw] if isinstance(raw, list) else []


def scores(competency: Any) -> dict[str, int]:
    return {dim: dimension_score(competency, dim) for dim in DIMENSIONS}


def has_signal(competency: Any) -> bool:
    """True once any dimension has moved off the neutral start."""
    return any(score != START_SCORE for score in scores(competency).values())


def weak_dimensions(competency: Any) -> list[str]:
    """Dimensions below the gap floor, weakest first — these become Control Gaps."""
    ranked = sorted(scores(competency).items(), key=lambda kv: (kv[1], kv[0]))
    return [dim for dim, score in ranked if score < GAP_FLOOR]


def extract_controls(*texts: str | None) -> list[str]:
    """
    Pull ISO 27001:2022 control references out of authored rationale text.

    Deduplicated and sorted numerically so A.5.9 precedes A.5.12, which a plain
    string sort would invert.
    """
    annex: set[tuple[int, int]] = set()
    clauses: set[int] = set()
    for blob in texts:
        if not blob:
            continue
        for clause, control in _ANNEX_A.findall(blob):
            annex.add((int(clause), int(control)))
        for clause in _CLAUSE.findall(blob):
            clauses.add(int(clause))
    refs = [f"A.{clause}.{control}" for clause, control in sorted(annex)]
    refs += [f"Clause {clause}" for clause in sorted(clauses)]
    return refs


@dataclass(frozen=True)
class DimensionRollup:
    """One dimension aggregated across every session a learner has run."""

    dimension: str
    label: str
    score: int
    best: int
    scenarios_with_signal: int
    proven: bool
    is_gap: bool


def rollup_dimensions(sessions: list[dict[str, Any]]) -> list[DimensionRollup]:
    """
    Aggregate per-session competency into one view per dimension.

    `score` is the latest observed value rather than an average: competency is a
    current capability claim, and averaging in an early bad run would understate
    someone who has since demonstrated the control. `scenarios_with_signal`
    counts distinct scenarios, which is what gates `proven`.

    Sessions must be ordered oldest-first.
    """
    latest: dict[str, int] = {dim: START_SCORE for dim in DIMENSIONS}
    best: dict[str, int] = {dim: START_SCORE for dim in DIMENSIONS}
    seen: dict[str, set[str]] = {dim: set() for dim in DIMENSIONS}

    for session in sessions:
        competency = session.get("competency")
        if not has_signal(competency):
            continue
        slug = str(session.get("scenario") or session.get("scenario_slug") or "")
        for dim in DIMENSIONS:
            score = dimension_score(competency, dim)
            latest[dim] = score
            best[dim] = max(best[dim], score)
            if score != START_SCORE and slug:
                seen[dim].add(slug)

    return [
        DimensionRollup(
            dimension=dim,
            label=HUMAN_LABELS[dim],
            score=latest[dim],
            best=best[dim],
            scenarios_with_signal=len(seen[dim]),
            proven=(
                latest[dim] >= PROVEN_THRESHOLD
                and len(seen[dim]) >= MIN_SCENARIOS_FOR_PROVEN
            ),
            is_gap=latest[dim] < GAP_FLOOR,
        )
        for dim in DIMENSIONS
    ]


def track_complete(sessions: list[dict[str, Any]], scenario_total: int) -> bool:
    """
    Track completion: every scenario finished and every dimension proven.

    Deliberately strict. This is the claim an employer would rely on, so it needs
    both breadth (all scenarios reached a terminal stage) and depth (each
    dimension at threshold across at least two scenarios).
    """
    if scenario_total <= 0:
        return False
    finished = {
        str(s.get("scenario") or s.get("scenario_slug") or "")
        for s in sessions
        if str(s.get("stage") or "") == TERMINAL_STAGE
    }
    finished.discard("")
    if len(finished) < scenario_total:
        return False
    return all(item.proven for item in rollup_dimensions(sessions))
