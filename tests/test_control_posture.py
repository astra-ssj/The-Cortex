# tests/test_control_posture.py — Competency-per-control derivation.
#
# The failure path matters more than the happy path here: a control ref authored
# against a control the framework does not define, or a banding that disagrees
# with the learner ledger, would put a plausible-looking but wrong number on the
# Compliance Overview.

from __future__ import annotations

import json
import os

import psycopg2
import pytest

from compliance import FrameworkId, get as get_framework, register_all
from core.competency import GAP_FLOOR, PROVEN_THRESHOLD, START_SCORE
from core.control_posture import (
    STATUS_DEVELOPING,
    STATUS_GAP,
    STATUS_STRONG,
    ChoiceContent,
    ScenarioCatalogue,
    band,
    coverable_controls,
    derive_control_posture,
    not_assessed_controls,
)

register_all()


def _pg_connect():
    url = os.environ.get("DATABASE_URL", "")
    return psycopg2.connect(
        host=os.environ.get("PGHOST", "127.0.0.1"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "cortex"),
        password=os.environ.get(
            "PGPASSWORD", "cortex_ci_test" if "cortex_ci_test" in url else "cortex_ci_test"
        ),
        dbname=os.environ.get("PGDATABASE", "cortex"),
        connect_timeout=3,
    )


def _competency(**scores: int) -> dict[str, object]:
    return {dim: {"score": score, "delta": 0, "observations": []} for dim, score in scores.items()}


def _session(learner: str, scenario: str, choices: list[str], **scores: int) -> dict[str, object]:
    return {
        "learner_id": learner,
        "scenario": scenario,
        "stage": "complete",
        "competency": _competency(**scores),
        "state": {"decisions": [{"choice": c} for c in choices]},
    }


ISO = FrameworkId.ISO27001_2022


# ── Banding agrees with the learner ledger ──────────────────────────────


def test_band_reuses_ledger_thresholds() -> None:
    assert band(PROVEN_THRESHOLD) == STATUS_STRONG
    assert band(PROVEN_THRESHOLD - 1) == STATUS_DEVELOPING
    assert band(GAP_FLOOR) == STATUS_DEVELOPING
    assert band(GAP_FLOOR - 1) == STATUS_GAP
    assert band(0) == STATUS_GAP


# ── Authored content resolves against the registry ──────────────────────


@pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="database URL not configured"
)
def test_every_authored_control_ref_exists_in_the_framework() -> None:
    """
    Migration 035 authors control ids by hand. An id that the registry does not
    define would silently drop out of the overview, understating coverage.
    """
    try:
        conn = _pg_connect()
    except Exception:
        pytest.skip("database not reachable")
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT jsonb_array_elements_text(control_refs) FROM scenario_choices")
            refs = {row[0] for row in cur.fetchall()}
    finally:
        conn.close()

    assert refs, "migration 035 backfill did not run"
    known = {c.id for c in get_framework(ISO).controls}
    assert refs <= known, f"unresolved control refs: {sorted(refs - known)}"


@pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="database URL not configured"
)
def test_every_active_choice_has_control_refs() -> None:
    """A choice with no refs is a decision that costs the learner nothing."""
    try:
        conn = _pg_connect()
    except Exception:
        pytest.skip("database not reachable")
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.slug, st.slug, c.choice_id
                FROM scenario_choices c
                JOIN scenario_stages st ON st.id = c.stage_id
                JOIN scenarios s ON s.id = st.scenario_id
                WHERE s.active AND c.control_refs = '[]'::jsonb
                """
            )
            unmapped = cur.fetchall()
    finally:
        conn.close()

    assert not unmapped, f"choices without control_refs: {unmapped}"


# ── Derivation ──────────────────────────────────────────────────────────


def _content(
    refs: set[str], dims: set[str], next_stage: str | None = "complete"
) -> ChoiceContent:
    return ChoiceContent(
        control_refs=frozenset(refs), dimensions=frozenset(dims), next_stage=next_stage
    )


def _catalogue(
    entries: dict[tuple[str, str, str], ChoiceContent] | None = None,
    entry_stage: str = "stage1",
) -> ScenarioCatalogue:
    entries = entries or {
        ("s1", "stage1", "good"): _content({"a.8.2"}, {"control_mapping"}),
        ("s1", "stage1", "bad"): _content({"a.8.2"}, {"control_mapping"}),
        ("s1", "stage1", "other"): _content({"a.5.18"}, {"evidence"}),
    }
    catalogue = ScenarioCatalogue(entry_stages={"s1": entry_stage})
    for (scenario, stage, choice_id), content in entries.items():
        catalogue.choices[(scenario, stage, choice_id)] = content
        catalogue.by_choice.setdefault((scenario, choice_id), []).append(content)
        catalogue.entry_stages.setdefault(scenario, stage)
    return catalogue


def test_control_score_comes_from_the_dimensions_the_choice_moved() -> None:
    sessions = [_session("u1", "s1", ["good"], control_mapping=82, evidence=20)]
    posture = derive_control_posture(sessions, _catalogue(), ISO)

    assert len(posture) == 1
    row = posture[0]
    assert row.ref == "a.8.2"
    # evidence sat at 20 but that choice never moved it, so it must not drag a.8.2 down.
    assert row.competency == 82
    assert row.status == STATUS_STRONG
    assert row.dimensions == ["Control mapping"]
    assert row.scenario_slug == "s1"


def test_latest_session_wins_for_one_learner() -> None:
    """Competency is a current capability claim, not a running average."""
    sessions = [
        _session("u1", "s1", ["bad"], control_mapping=30),
        _session("u1", "s1", ["good"], control_mapping=88),
    ]
    posture = derive_control_posture(sessions, _catalogue(), ISO)
    assert posture[0].competency == 88
    assert posture[0].status == STATUS_STRONG


def test_learners_are_averaged_not_overwritten() -> None:
    """
    A strong learner training after a weak one must not erase the weak signal —
    that is the whole difference between a personal and an organisational claim.
    """
    sessions = [
        _session("weak", "s1", ["bad"], control_mapping=40),
        _session("strong", "s1", ["good"], control_mapping=80),
    ]
    posture = derive_control_posture(sessions, _catalogue(), ISO)
    assert posture[0].competency == 60
    assert posture[0].status == STATUS_DEVELOPING


def test_session_without_signal_is_ignored() -> None:
    sessions = [_session("u1", "s1", ["good"], **{dim: START_SCORE for dim in ("control_mapping",)})]
    assert derive_control_posture(sessions, _catalogue(), ISO) == []


def test_decision_for_unknown_choice_is_skipped() -> None:
    sessions = [_session("u1", "s1", ["never_authored"], control_mapping=90)]
    assert derive_control_posture(sessions, _catalogue(), ISO) == []


def test_ref_outside_the_framework_is_dropped_not_invented() -> None:
    catalogue = _catalogue(
        {("s1", "stage1", "good"): _content({"a.99.99"}, {"control_mapping"})}
    )
    sessions = [_session("u1", "s1", ["good"], control_mapping=90)]
    assert derive_control_posture(sessions, catalogue, ISO) == []


def test_controls_sort_numerically_and_clauses_come_last() -> None:
    catalogue = _catalogue(
        {
            ("s1", "stage1", "c1"): _content({"a.5.12"}, {"evidence"}, next_stage="stage2"),
            ("s1", "stage2", "c2"): _content({"a.5.9"}, {"evidence"}, next_stage="stage3"),
            ("s1", "stage3", "c3"): _content({"clause.10.1"}, {"evidence"}),
        }
    )
    sessions = [_session("u1", "s1", ["c1", "c2", "c3"], evidence=75)]
    refs = [row.ref for row in derive_control_posture(sessions, catalogue, ISO)]
    assert refs == ["a.5.9", "a.5.12", "clause.10.1"]


# ── Path replay ─────────────────────────────────────────────────────────


def _branching_catalogue() -> ScenarioCatalogue:
    """
    Mirrors cloud_access_onboarding: the correct answer at the first stage ends
    the scenario, so the later stages — which move an extra dimension — are only
    reached by answering badly first.
    """
    return _catalogue(
        {
            ("s1", "stage1", "right"): _content({"a.8.2"}, {"control_mapping"}),
            ("s1", "stage1", "wrong"): _content({"a.8.2"}, {"control_mapping"}, next_stage="stage2"),
            ("s1", "stage2", "right"): _content(
                {"a.8.2"}, {"control_mapping", "remediation"}
            ),
        }
    )


def test_a_clean_first_pass_is_not_scored_on_stages_it_never_reached() -> None:
    """
    Regression: resolving a choice id without its stage unioned the dimensions of
    every stage offering that id. A learner who answered correctly first time was
    then scored on remediation — a dimension they never touched, sitting at the
    neutral 50 — which dragged a correct answer below the gap floor.
    """
    sessions = [_session("u1", "s1", ["right"], control_mapping=80, remediation=50)]
    posture = derive_control_posture(sessions, _branching_catalogue(), ISO)

    assert posture[0].competency == 80
    assert posture[0].status == STATUS_STRONG
    assert posture[0].dimensions == ["Control mapping"]


def test_reaching_a_later_stage_does_pick_up_its_dimensions() -> None:
    sessions = [_session("u1", "s1", ["wrong", "right"], control_mapping=80, remediation=40)]
    posture = derive_control_posture(sessions, _branching_catalogue(), ISO)

    # stage1 contributed control_mapping, stage2 added remediation.
    assert posture[0].dimensions == ["Control mapping", "Remediation"]
    assert posture[0].competency == 60


def test_unwalkable_path_falls_back_to_what_the_stages_agree_on() -> None:
    """
    Content edited after a session was recorded must understate rather than
    invent: only attribution common to every stage offering the choice counts.
    """
    catalogue = _catalogue(
        {
            ("s1", "stage1", "opener"): _content({"a.8.2"}, {"control_mapping"}, next_stage="gone"),
            ("s1", "stageA", "shared"): _content(
                {"a.8.2", "a.5.18"}, {"control_mapping", "evidence"}
            ),
            ("s1", "stageB", "shared"): _content({"a.8.2"}, {"control_mapping"}),
        }
    )
    sessions = [_session("u1", "s1", ["opener", "shared"], control_mapping=90, evidence=10)]
    posture = derive_control_posture(sessions, catalogue, ISO)

    # a.5.18 is only authored at stageA, so it is not claimed; evidence likewise.
    assert [row.ref for row in posture] == ["a.8.2"]
    assert posture[0].dimensions == ["Control mapping"]
    assert posture[0].competency == 90


def test_coverable_and_not_assessed_use_the_scenario_denominator() -> None:
    catalogue = _catalogue()
    coverable = coverable_controls(catalogue)
    assert coverable == {"a.8.2", "a.5.18"}

    remaining = not_assessed_controls({"a.8.2"}, coverable, ISO)
    assert [row["ref"] for row in remaining] == ["a.5.18"]
    assert remaining[0]["name"] == "Access Rights"


def test_json_encoded_state_is_accepted() -> None:
    """asyncpg hands JSONB back as str on some paths; the derivation must cope."""
    session = _session("u1", "s1", ["good"], control_mapping=90)
    session["state"] = json.dumps(session["state"])
    session["competency"] = json.dumps(session["competency"])
    posture = derive_control_posture([session], _catalogue(), ISO)
    assert posture[0].competency == 90
