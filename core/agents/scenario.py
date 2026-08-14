# core/agents/scenario.py — Deterministic Learning Loop scenario controller helpers.
#
# The API advances the loop; the agent is consulted via the harness and never free-writes state.
#
# Scenario *content* (brief, stage scripts, choices, graded answers, next_stage,
# risk_outcome) lives in the database from migration 019 onward (transition
# columns from 025) and is read through load_scenario(). The controller *applies*
# those columns — scenario_choices stays SELECT-only, so a content author still
# cannot rewrite the risk model through the API. HARDCODED_SCENARIO keeps the
# compiled-in CX-1001 maps when the DB is unavailable or CORTEX_SCENARIO_HARDCODED=1.

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.agents.harness import DEVOPS_LEAD_ROLE, AgentResponse, call_agent

logger = structlog.get_logger()

SCENARIO_ID = "cloud_access_onboarding"

SCENARIO_BRIEF = (
    "You are the security reviewer for a Friday production cutover. The DevOps Lead is "
    "asking for broad cloud access (prod admin, staging, shared CI). Choose how to respond — "
    "your decision drives risk and the next agent turn."
)

CHOICE_LABELS: dict[str, str] = {
    "approve_all": "Approve all requested access",
    "least_privilege": "Grant least privilege only",
    "challenge": "Challenge — demand justification",
    "deny": "Deny the request",
}

_AVAILABLE_CHOICES = [
    {"id": k, "label": v} for k, v in CHOICE_LABELS.items()
]

# Set to 1 to bypass the database entirely and serve the compiled-in scenario.
# Keeps harness/controller unit tests runnable without Postgres.
_HARDCODED_ENV = "CORTEX_SCENARIO_HARDCODED"

ENTRY_STAGE = "access_request"
ESCALATION_STAGE = "escalation"
TERMINAL_STAGE = "complete"


class ScenarioNotFound(LookupError):
    """Requested scenario slug is not present (or not active) in the content model."""


@dataclass(frozen=True)
class ScenarioChoice:
    choice_id: str
    label: str
    consequence: str = ""
    is_correct: bool = False
    framework_rationale: str | None = None
    next_stage: str | None = None
    risk_outcome: str | None = None


@dataclass(frozen=True)
class ScenarioStage:
    slug: str
    sequence: int
    agent_message: str = ""
    demands: tuple[str, ...] = ()
    choices: tuple[ScenarioChoice, ...] = ()


@dataclass(frozen=True)
class Scenario:
    """A scenario definition, whether loaded from the DB or compiled in as fallback."""

    slug: str
    title: str
    brief: str
    track: str
    frameworks: tuple[str, ...]
    difficulty: str
    stages: tuple[ScenarioStage, ...]

    @property
    def entry_stage(self) -> ScenarioStage | None:
        return self.stages[0] if self.stages else None

    def stage(self, slug: str) -> ScenarioStage | None:
        for stage in self.stages:
            if stage.slug == slug:
                return stage
        return None

    def choices_for_stage(self, slug: str) -> list[dict[str, str]]:
        """
        Learner-facing options for a stage.

        Unknown stages resolve to the entry stage, matching the pre-content-model
        behaviour where any unrecognised stage offered the full choice set.
        """
        stage = self.stage(slug) or self.entry_stage
        if stage is None:
            return []
        return [{"id": c.choice_id, "label": c.label} for c in stage.choices]

    def valid_choice_ids(self) -> frozenset[str]:
        return frozenset(c.choice_id for stage in self.stages for c in stage.choices)


def _hardcoded_stage(slug: str, sequence: int, choice_ids: tuple[str, ...]) -> ScenarioStage:
    return ScenarioStage(
        slug=slug,
        sequence=sequence,
        agent_message="",
        demands=(),
        choices=tuple(
            ScenarioChoice(choice_id=cid, label=CHOICE_LABELS[cid]) for cid in choice_ids
        ),
    )


# Fallback content — byte-identical to what the loop served before migration 019.
HARDCODED_SCENARIO = Scenario(
    slug=SCENARIO_ID,
    title="Friday Cutover: Privileged Cloud Access Request",
    brief=SCENARIO_BRIEF,
    track="ai-risk-lead",
    frameworks=("iso27001-2022", "nist-csf-2.0"),
    difficulty="foundation",
    stages=(
        _hardcoded_stage(ENTRY_STAGE, 1, tuple(CHOICE_LABELS)),
        _hardcoded_stage(ESCALATION_STAGE, 2, ("approve_all", "least_privilege", "deny")),
        ScenarioStage(slug=TERMINAL_STAGE, sequence=3),
    ),
)

_LOAD_SQL = text(
    """
    SELECT s.slug          AS scenario_slug,
           s.title         AS title,
           s.brief         AS brief,
           s.track         AS track,
           s.frameworks    AS frameworks,
           s.difficulty    AS difficulty,
           st.slug         AS stage_slug,
           st.sequence     AS stage_sequence,
           st.agent_message AS agent_message,
           st.demands      AS demands,
           c.choice_id     AS choice_id,
           c.label         AS label,
           c.consequence   AS consequence,
           c.is_correct    AS is_correct,
           c.framework_rationale AS framework_rationale,
           c.next_stage    AS next_stage,
           c.risk_outcome  AS risk_outcome
    FROM scenarios s
    LEFT JOIN scenario_stages st ON st.scenario_id = s.id
    LEFT JOIN scenario_choices c ON c.stage_id = st.id
    WHERE s.slug = :slug AND s.active
    ORDER BY st.sequence, c.display_order, c.choice_id
    """
)

# Pre-025 content tables have no transition columns; selecting them would abort
# the caller's transaction the same way a missing table would.
_LOAD_SQL_PRE_025 = text(
    """
    SELECT s.slug          AS scenario_slug,
           s.title         AS title,
           s.brief         AS brief,
           s.track         AS track,
           s.frameworks    AS frameworks,
           s.difficulty    AS difficulty,
           st.slug         AS stage_slug,
           st.sequence     AS stage_sequence,
           st.agent_message AS agent_message,
           st.demands      AS demands,
           c.choice_id     AS choice_id,
           c.label         AS label,
           c.consequence   AS consequence,
           c.is_correct    AS is_correct,
           c.framework_rationale AS framework_rationale
    FROM scenarios s
    LEFT JOIN scenario_stages st ON st.scenario_id = s.id
    LEFT JOIN scenario_choices c ON c.stage_id = st.id
    WHERE s.slug = :slug AND s.active
    ORDER BY st.sequence, c.display_order, c.choice_id
    """
)


def _hardcoded_mode() -> bool:
    return os.getenv(_HARDCODED_ENV, "").strip().lower() in ("1", "true", "yes")


def _rows_to_scenario(rows: list[Any]) -> Scenario:
    """Fold the stage/choice join back into nested objects, preserving row order."""
    head = rows[0]
    stage_meta: dict[str, tuple[int, str, tuple[str, ...]]] = {}
    stage_choices: dict[str, list[ScenarioChoice]] = {}

    for row in rows:
        stage_slug = row["stage_slug"]
        if stage_slug is None:
            continue
        stage_slug = str(stage_slug)
        if stage_slug not in stage_meta:
            stage_meta[stage_slug] = (
                int(row["stage_sequence"]),
                str(row["agent_message"] or ""),
                tuple(row["demands"] or ()),
            )
            stage_choices[stage_slug] = []
        if row["choice_id"] is not None:
            next_stage = row["next_stage"] if "next_stage" in row else None
            risk_outcome = row["risk_outcome"] if "risk_outcome" in row else None
            stage_choices[stage_slug].append(
                ScenarioChoice(
                    choice_id=str(row["choice_id"]),
                    label=str(row["label"]),
                    consequence=str(row["consequence"] or ""),
                    is_correct=bool(row["is_correct"]),
                    framework_rationale=row["framework_rationale"],
                    next_stage=str(next_stage) if next_stage is not None else None,
                    risk_outcome=str(risk_outcome) if risk_outcome is not None else None,
                )
            )

    return Scenario(
        slug=str(head["scenario_slug"]),
        title=str(head["title"]),
        brief=str(head["brief"]),
        track=str(head["track"]),
        frameworks=tuple(head["frameworks"] or ()),
        difficulty=str(head["difficulty"]),
        stages=tuple(
            ScenarioStage(
                slug=slug,
                sequence=meta[0],
                agent_message=meta[1],
                demands=meta[2],
                choices=tuple(stage_choices[slug]),
            )
            for slug, meta in stage_meta.items()
        ),
    )


async def load_scenario(scenario_slug: str, db: AsyncSession | None = None) -> Scenario:
    """
    Resolve scenario content by slug, preferring the database.

    Falls back to HARDCODED_SCENARIO when CORTEX_SCENARIO_HARDCODED=1, when no
    session is supplied, or when the content tables predate migration 019 — the
    loop must keep running on databases that have not been migrated yet. Any
    other slug in those conditions raises ScenarioNotFound rather than silently
    serving the wrong scenario.
    """
    slug = (scenario_slug or SCENARIO_ID).strip() or SCENARIO_ID

    def _fallback(reason: str) -> Scenario:
        if slug != HARDCODED_SCENARIO.slug:
            raise ScenarioNotFound(slug)
        logger.info("scenario_content_fallback", slug=slug, reason=reason)
        return HARDCODED_SCENARIO

    if _hardcoded_mode():
        return _fallback("env_flag")
    if db is None:
        return _fallback("no_session")

    # to_regclass rather than a bare SELECT: a missing table would abort the
    # caller's transaction, taking the session insert and audit writes with it.
    present = (
        await db.execute(text("SELECT to_regclass('public.scenarios') IS NOT NULL"))
    ).scalar()
    if not present:
        return _fallback("table_missing")

    has_transitions = (
        await db.execute(
            text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'scenario_choices'
                      AND column_name = 'next_stage'
                )
                """
            )
        )
    ).scalar()
    load_sql = _LOAD_SQL if has_transitions else _LOAD_SQL_PRE_025
    rows = (await db.execute(load_sql, {"slug": slug})).mappings().all()
    if not rows:
        raise ScenarioNotFound(slug)
    return _rows_to_scenario(list(rows))


def _resolve(scenario: Scenario | None) -> Scenario:
    return scenario or HARDCODED_SCENARIO


def initial_state(
    *,
    opening: AgentResponse,
    scenario: Scenario | None = None,
) -> dict[str, Any]:
    active = _resolve(scenario)
    return {
        "brief": active.brief,
        "messages": [
            {
                "speaker": opening.speaker,
                "stance": opening.stance,
                "message": opening.message,
                "demands": list(opening.demands),
            }
        ],
        "choices": active.choices_for_stage(ENTRY_STAGE),
        "decisions": [],
        "last_harness": opening.model_dump(),
        "scenario_id": active.slug,
    }


def risk_for_choice(
    choice: str,
    scenario_choices: list[ScenarioChoice] | None = None,
) -> str:
    """Deterministic risk mapping — controller owns risk, not the agent."""
    if scenario_choices:
        for sc in scenario_choices:
            if sc.choice_id == choice:
                return sc.risk_outcome or "unknown"
    # Hardcoded fallback for HARDCODED_SCENARIO (CX-1001 only)
    _HARDCODED_RISK = {
        "approve_all": "over-provisioned",
        "least_privilege": "controlled",
        "deny": "blocked",
        "challenge": "under_review",
    }
    return _HARDCODED_RISK.get(choice, "unknown")


def stage_after_choice(
    choice: str,
    prior_stage: str,
    scenario_choices: list[ScenarioChoice] | None = None,
) -> str:
    if scenario_choices:
        for sc in scenario_choices:
            if sc.choice_id == choice:
                return sc.next_stage or TERMINAL_STAGE
    # Hardcoded fallback for HARDCODED_SCENARIO (CX-1001 only)
    _HARDCODED_STAGE = {
        "approve_all": TERMINAL_STAGE,
        "least_privilege": TERMINAL_STAGE,
        "deny": TERMINAL_STAGE,
        "challenge": ESCALATION_STAGE,
    }
    return _HARDCODED_STAGE.get(choice, prior_stage or ENTRY_STAGE)


def choices_for_stage(stage: str, scenario: Scenario | None = None) -> list[dict[str, str]]:
    return _resolve(scenario).choices_for_stage(stage)


def _situation_for_stage(active: Scenario, stage_slug: str) -> str:
    """
    Prompt seed for a stage.

    A DB stage carries a scripted line the agent should open on; the hardcoded
    fallback has none, so it seeds with the brief exactly as it always did.
    """
    stage = active.stage(stage_slug)
    if stage is not None and stage.agent_message:
        return stage.agent_message
    return active.brief


async def open_session_agent_turn(
    session_row: dict[str, Any],
    scenario: Scenario | None = None,
) -> AgentResponse:
    active = _resolve(scenario)
    return await call_agent(
        DEVOPS_LEAD_ROLE,
        _situation_for_stage(active, ENTRY_STAGE),
        session_row,
    )


async def advance_after_decision(
    *,
    session_row: dict[str, Any],
    choice: str,
    scenario: Scenario | None = None,
) -> tuple[dict[str, Any], str, str, AgentResponse]:
    """
    Apply learner choice, consult agent, compute risk/stage.

    Returns (new_state, new_stage, new_risk, harness_result).
    Never writes malformed harness data — AgentResponse is always valid.
    """
    active = _resolve(scenario)
    state = dict(session_row.get("state") or {})
    messages = list(state.get("messages") or [])
    decisions = list(state.get("decisions") or [])
    now = datetime.now(timezone.utc).isoformat()
    decisions.append({"choice": choice, "at": now})

    all_choices = [c for stage in active.stages for c in stage.choices]
    # HARDCODED_SCENARIO choices have no transition columns — pass None so the
    # CX-1001 maps still apply. Content-loaded rows carry next_stage/risk_outcome.
    content_driven = any(
        c.next_stage is not None or c.risk_outcome is not None for c in all_choices
    )
    choice_rows = all_choices if content_driven else None
    prior_stage = str(session_row.get("stage") or ENTRY_STAGE)
    risk = risk_for_choice(choice, choice_rows)
    stage = stage_after_choice(choice, prior_stage, choice_rows)

    interim = {
        **session_row,
        "stage": stage,
        "risk": risk,
        "state": {
            **state,
            "decisions": decisions,
            "messages": messages,
        },
    }
    agent = await call_agent(
        DEVOPS_LEAD_ROLE,
        f"Learner chose '{choice}'. Risk is now '{risk}'. Respond in character.",
        interim,
    )
    messages.append(
        {
            "speaker": agent.speaker,
            "stance": agent.stance,
            "message": agent.message,
            "demands": list(agent.demands),
        }
    )
    new_state: dict[str, Any] = {
        **state,
        "brief": state.get("brief") or active.brief,
        "messages": messages,
        "choices": active.choices_for_stage(stage),
        "decisions": decisions,
        "last_harness": agent.model_dump(),
        "scenario_id": active.slug,
    }
    return new_state, stage, risk, agent
