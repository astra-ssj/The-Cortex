# api/learning.py — Learning Loop v1 controller (deterministic; agent consulted via harness).

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.limits import authenticated_rate_limit_key, limiter
from compliance.models import SovereignModel
from core.agents.grading import grade_decision
from core.agents.scenario import (
    ENTRY_STAGE,
    EXPERT_DIFFICULTY,
    SCENARIO_ID,
    TERMINAL_STAGE,
    Scenario,
    ScenarioNotFound,
    advance_after_decision,
    initial_state,
    load_scenario,
    open_session_agent_turn,
)
from core.audit_fabric import append_audit_log
from core.competency import (
    DIMENSIONS,
    HUMAN_LABELS,
    dimension_observations,
    dimension_score,
    extract_controls,
    rollup_dimensions,
    track_complete,
    weak_dimensions,
)
from core.assessment_llm import CONFIDENCE_THRESHOLD
from core.gaps import reconcile_gaps_for_session
from core.human_review import enqueue_learning_decision_review
from core.rbac import Permission, user_has_permission
from core.security import get_current_user
from core.tenant import (
    DEMO_ORG_ID,
    bind_scoped_org,
    bind_writable_org,
    resolve_scoped_org_id,
)

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/learning", tags=["learning"])

_VALID_CHOICES = frozenset({"approve_all", "least_privilege", "challenge", "deny"})


class CreateSessionRequest(BaseModel):
    scenario: str = Field(default=SCENARIO_ID, description="Deprecated alias for scenario_slug")
    scenario_slug: Optional[str] = Field(
        default=None,
        description="Scenario slug in the content model (defaults to cloud_access_onboarding)",
    )
    org_id: Optional[str] = Field(default=None, description="Scoped org (JWT org or demo)")
    # Carried from the Audit Simulator so a completed session is attributable to the
    # frame the learner chose, rather than only to the scenario they happened to pick.
    framework: Optional[str] = Field(
        default=None, description="Framework id selected in the Audit Simulator"
    )
    audit_type: Optional[str] = Field(
        default=None, description="Audit type selected in the Audit Simulator"
    )

    def resolved_slug(self) -> str:
        for candidate in (self.scenario_slug, self.scenario):
            if candidate and candidate.strip():
                return candidate.strip()
        return SCENARIO_ID


class DecideRequest(BaseModel):
    choice: str = Field(..., min_length=1, description="Learner choice id")


class ScenarioSummary(BaseModel):
    """Shared curriculum row — not tenant-owned (no org_id / RLS)."""

    slug: str
    title: str
    brief: str
    track: str
    frameworks: list[str]
    difficulty: str


class SessionOut(SovereignModel):
    """Org-scoped learning session — inherits jurisdiction + purpose tags (ZTAIP)."""

    id: str
    org_id: str
    scenario: str
    learner_id: str
    state: dict[str, Any]
    stage: str
    risk: Optional[str] = None
    competency: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SessionSummary(SovereignModel):
    """Org-scoped history row — competency scores without session state."""

    session_id: str
    scenario_slug: str
    scenario_title: str
    difficulty: str
    learner_id: str = ""
    stage: str
    risk: Optional[str] = None
    competency: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class DebriefDecision(BaseModel):
    """One graded decision, paired with the reference answer for its stage."""

    sequence: int
    stage: str
    chosen_id: str
    chosen_label: str
    correct: bool
    consequence: str
    framework_rationale: str
    reference_id: Optional[str] = None
    reference_label: Optional[str] = None
    reference_rationale: Optional[str] = None
    controls: list[str] = Field(default_factory=list)
    observations: list[str] = Field(default_factory=list)
    decided_at: Optional[str] = None


class DebriefDimension(BaseModel):
    dimension: str
    label: str
    score: int
    is_gap: bool
    observations: list[str] = Field(default_factory=list)


class DebriefOut(SovereignModel):
    """
    Post-scenario review: what the learner chose, what was correct, and why.

    Everything here was already persisted by decide() — the rationale, the
    observations, the reference answers — and had no surface to render it.
    """

    session_id: str
    scenario_slug: str
    scenario_title: str
    difficulty: str
    frameworks: list[str] = Field(default_factory=list)
    brief: str = ""
    stage: str
    risk: Optional[str] = None
    complete: bool = False
    decisions: list[DebriefDecision] = Field(default_factory=list)
    competency: list[DebriefDimension] = Field(default_factory=list)
    controls_touched: list[str] = Field(default_factory=list)
    gap_dimensions: list[str] = Field(default_factory=list)
    correct_count: int = 0
    decision_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LearnerDimension(BaseModel):
    """One competency dimension rolled up across every session a learner ran."""

    dimension: str
    label: str
    score: int
    best: int
    scenarios_with_signal: int
    proven: bool
    is_gap: bool


class LearnerCompetency(SovereignModel):
    """
    Per-learner competency, keyed on (org_id, learner_id).

    Sessions carry competency; people carry competence. Completion claims have to
    be made about a person, so every session for a learner is folded into one row
    here — this is what both the individual ledger and the org ledger read.
    """

    org_id: str
    learner_id: str
    display_name: str = ""
    dimensions: list[LearnerDimension] = Field(default_factory=list)
    sessions_started: int = 0
    scenarios_completed: int = 0
    scenarios_available: int = 0
    gap_dimensions: list[str] = Field(default_factory=list)
    proven_dimensions: list[str] = Field(default_factory=list)
    track_complete: bool = False
    last_active_at: Optional[str] = None


def _resolve_org(current_user: dict[str, Any], requested: Optional[str]) -> str:
    if requested and requested.strip():
        return resolve_scoped_org_id(current_user, requested.strip())
    return str(current_user.get("org_id") or DEMO_ORG_ID).strip()


def _learner_id(current_user: dict[str, Any]) -> str:
    """Must match the learner_id written by create_session."""
    return str(current_user.get("sub") or current_user.get("email") or "anonymous")


def _require_team_scope(current_user: dict[str, Any], scope: str) -> bool:
    """Resolve scope to a boolean, refusing 'team' without the permission."""
    if scope != "team":
        return False
    if not user_has_permission(current_user, Permission.view_team_competency):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: view_team_competency",
        )
    return True


def _json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        value = json.loads(value)
    return dict(value or {})


def _row_to_out(row: Any) -> SessionOut:
    created = row["created_at"]
    updated = row["updated_at"]
    try:
        raw_competency = row["competency"]
    except (KeyError, TypeError):
        raw_competency = {}
    return SessionOut(
        jurisdiction="internal",
        purpose_tags=["learning", "onboarding", "agent-harness"],
        id=str(row["id"]),
        org_id=str(row["org_id"]),
        scenario=str(row["scenario"]),
        learner_id=str(row["learner_id"]),
        state=_json_object(row["state"]),
        stage=str(row["stage"]),
        risk=str(row["risk"]) if row["risk"] is not None else None,
        competency=_json_object(raw_competency),
        created_at=created.isoformat() if hasattr(created, "isoformat") else (str(created) if created else None),
        updated_at=updated.isoformat() if hasattr(updated, "isoformat") else (str(updated) if updated else None),
    )


async def _load_content(session: AsyncSession, slug: str) -> Scenario:
    """Resolve scenario content, mapping an unknown slug to a 400 rather than a 500."""
    try:
        return await load_scenario(slug, session)
    except ScenarioNotFound:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown scenario '{slug}'",
        ) from None


async def _fetch_session(session: AsyncSession, session_id: uuid.UUID) -> Any | None:
    result = await session.execute(
        text(
            """
            SELECT id, org_id, scenario, learner_id, state, stage, risk, competency, created_at, updated_at
            FROM scenario_sessions
            WHERE id = :id
            """
        ),
        {"id": str(session_id)},
    )
    return result.mappings().first()


def _frameworks_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item) for item in value]
    return [str(value)]


@router.get(
    "/scenarios",
    response_model=list[ScenarioSummary],
    summary="List active learning scenarios",
)
async def list_scenarios(
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ScenarioSummary]:
    # Auth is the gate; catalogue rows are shared content (no tenant filter).
    _ = current_user
    present = (
        await db.execute(text("SELECT to_regclass('public.scenarios') IS NOT NULL"))
    ).scalar()
    if not present:
        return []

    result = await db.execute(
        text(
            """
            SELECT slug, title, brief, track, frameworks, difficulty
            FROM scenarios
            WHERE active = true
            ORDER BY
              CASE difficulty
                WHEN 'foundation' THEN 1
                WHEN 'practitioner' THEN 2
                WHEN 'expert' THEN 3
                ELSE 4
              END,
              title
            """
        )
    )
    return [
        ScenarioSummary(
            slug=str(row["slug"]),
            title=str(row["title"]),
            brief=str(row["brief"]),
            track=str(row["track"]),
            frameworks=_frameworks_list(row["frameworks"]),
            difficulty=str(row["difficulty"]),
        )
        for row in result.mappings().all()
    ]


@router.post("/sessions", response_model=SessionOut, summary="Create a learning scenario session")
@limiter.limit("30/minute", key_func=authenticated_rate_limit_key)
async def create_session(
    request: Request,
    body: CreateSessionRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    effective = await bind_writable_org(db, current_user, _resolve_org(current_user, body.org_id))
    scenario = body.resolved_slug()
    content = await _load_content(db, scenario)
    learner_id = str(current_user.get("sub") or current_user.get("email") or "anonymous")
    entry_stage = content.entry_stage.slug if content.entry_stage is not None else ENTRY_STAGE

    start_hash = await append_audit_log(
        db,
        event_type="learning.session.create.start",
        entity_type="scenario_session",
        entity_id=None,
        org_id=effective,
        actor=learner_id,
        payload={"scenario": scenario, "org_id": effective},
    )

    # Seed row then consult agent so opening message is harness-validated.
    seed_state = {
        "brief": content.brief,
        "messages": [],
        "choices": [],
        "decisions": [],
        "last_harness": None,
        "scenario_id": scenario,
    }
    insert = await db.execute(
        text(
            """
            INSERT INTO scenario_sessions (
              org_id, scenario, learner_id, state, stage, risk, framework, audit_type
            )
            VALUES (
              :org_id, :scenario, :learner_id, CAST(:state AS jsonb), :stage, NULL,
              :framework, :audit_type
            )
            RETURNING id, org_id, scenario, learner_id, state, stage, risk, competency, created_at, updated_at
            """
        ),
        {
            "org_id": effective,
            "scenario": scenario,
            "learner_id": learner_id,
            "state": json.dumps(seed_state),
            "stage": entry_stage,
            "framework": (body.framework or "").strip() or None,
            "audit_type": (body.audit_type or "").strip() or None,
        },
    )
    row = insert.mappings().first()
    assert row is not None
    session_id = str(row["id"])

    opening = await open_session_agent_turn(
        {
            "id": session_id,
            "org_id": effective,
            "scenario": scenario,
            "stage": entry_stage,
            "risk": None,
            "state": seed_state,
        },
        content,
    )
    full_state = initial_state(opening=opening, scenario=content)

    updated = await db.execute(
        text(
            """
            UPDATE scenario_sessions
            SET state = CAST(:state AS jsonb),
                stage = :stage,
                updated_at = NOW()
            WHERE id = :id
            RETURNING id, org_id, scenario, learner_id, state, stage, risk, competency, created_at, updated_at
            """
        ),
        {"id": session_id, "state": json.dumps(full_state), "stage": entry_stage},
    )
    out_row = updated.mappings().first()
    assert out_row is not None

    await append_audit_log(
        db,
        event_type="learning.session.create.complete",
        entity_type="scenario_session",
        entity_id=session_id,
        org_id=effective,
        actor=learner_id,
        prev_hash_override=start_hash,
        payload={
            "scenario": scenario,
            "org_id": effective,
            "stage": entry_stage,
            "harness_speaker": opening.speaker,
        },
    )
    logger.info("learning_session_created", session_id=session_id, org_id=effective)
    return _row_to_out(out_row)


@router.get(
    "/sessions",
    response_model=list[SessionSummary],
    summary="List learning sessions for competency history",
)
async def list_sessions(
    org_id: Optional[str] = Query(None, description="Scoped organisation id"),
    scope: str = Query(
        "mine",
        pattern="^(mine|team)$",
        description="'mine' returns only the caller's sessions; 'team' requires view_team_competency",
    ),
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SessionSummary]:
    effective = await bind_scoped_org(db, current_user, _resolve_org(current_user, org_id))
    team = _require_team_scope(current_user, scope)
    learner_id = _learner_id(current_user)

    # Org scoping alone is not privacy: before the learner_id filter, every member
    # of an org read every other member's competency scores from "My Progress".
    result = await db.execute(
        text(
            """
            SELECT ss.id, ss.scenario, ss.learner_id, ss.stage, ss.risk,
                   ss.competency, ss.created_at, ss.updated_at,
                   sc.title as scenario_title,
                   sc.difficulty
            FROM scenario_sessions ss
            LEFT JOIN scenarios sc ON sc.slug = ss.scenario
            WHERE ss.org_id = :org_id
              AND (:team OR ss.learner_id = :learner_id)
            ORDER BY ss.updated_at DESC
            LIMIT 200
            """
        ),
        {"org_id": effective, "team": team, "learner_id": learner_id},
    )
    rows = result.mappings().all()
    logger.info(
        "learning_sessions_listed",
        org_id=effective,
        scope=scope,
        count=len(rows),
    )
    summaries: list[SessionSummary] = []
    for row in rows:
        created = row["created_at"]
        updated = row["updated_at"]
        slug = str(row["scenario"])
        title = row["scenario_title"]
        difficulty = row["difficulty"]
        summaries.append(
            SessionSummary(
                jurisdiction="internal",
                purpose_tags=["learning", "onboarding", "agent-harness"],
                session_id=str(row["id"]),
                scenario_slug=slug,
                scenario_title=str(title) if title else slug,
                difficulty=str(difficulty) if difficulty else "",
                learner_id=str(row["learner_id"]),
                stage=str(row["stage"]),
                risk=str(row["risk"]) if row["risk"] is not None else None,
                competency=_json_object(row["competency"]),
                created_at=(
                    created.isoformat()
                    if hasattr(created, "isoformat")
                    else (str(created) if created else None)
                ),
                updated_at=(
                    updated.isoformat()
                    if hasattr(updated, "isoformat")
                    else (str(updated) if updated else None)
                ),
            )
        )
    return summaries


async def _active_scenario_count(db: AsyncSession) -> int:
    """Denominator for track completion. 0 when the content tables are absent."""
    try:
        total = (
            await db.execute(
                text("SELECT count(*) FROM scenarios WHERE active")
            )
        ).scalar()
    except Exception:
        return 0
    return int(total or 0)


def _build_learner_rollup(
    *,
    org_id: str,
    learner_id: str,
    rows: list[dict[str, Any]],
    scenario_total: int,
) -> LearnerCompetency:
    """Fold one learner's sessions (oldest first) into a single competency claim."""
    dimensions = rollup_dimensions(rows)
    completed = {
        str(r.get("scenario") or "")
        for r in rows
        if str(r.get("stage") or "") == TERMINAL_STAGE
    }
    completed.discard("")
    last_seen = max(
        (r["updated_at"] for r in rows if r.get("updated_at") is not None),
        default=None,
    )
    display = next(
        (str(r["display_name"]) for r in reversed(rows) if r.get("display_name")),
        "",
    )
    return LearnerCompetency(
        jurisdiction="internal",
        purpose_tags=["learning", "assessment"],
        org_id=org_id,
        learner_id=learner_id,
        display_name=display,
        dimensions=[
            LearnerDimension(
                dimension=item.dimension,
                label=item.label,
                score=item.score,
                best=item.best,
                scenarios_with_signal=item.scenarios_with_signal,
                proven=item.proven,
                is_gap=item.is_gap,
            )
            for item in dimensions
        ],
        sessions_started=len(rows),
        scenarios_completed=len(completed),
        scenarios_available=scenario_total,
        gap_dimensions=[i.dimension for i in dimensions if i.is_gap],
        proven_dimensions=[i.dimension for i in dimensions if i.proven],
        track_complete=track_complete(rows, scenario_total),
        last_active_at=last_seen.isoformat() if hasattr(last_seen, "isoformat") else None,
    )


_ROLLUP_SQL = text(
    """
    SELECT ss.learner_id, ss.scenario, ss.stage, ss.competency, ss.updated_at,
           u.email AS display_name
    FROM scenario_sessions ss
    LEFT JOIN users u ON u.id::text = ss.learner_id
    WHERE ss.org_id = :org_id
      AND (:team OR ss.learner_id = :learner_id)
    ORDER BY ss.updated_at ASC
    """
)


@router.get(
    "/competency",
    response_model=LearnerCompetency,
    summary="Competency rollup for the calling learner",
)
async def get_my_competency(
    org_id: Optional[str] = Query(None, description="Scoped organisation id"),
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LearnerCompetency:
    effective = await bind_scoped_org(db, current_user, _resolve_org(current_user, org_id))
    learner_id = _learner_id(current_user)
    rows = (
        await db.execute(
            _ROLLUP_SQL,
            {"org_id": effective, "team": False, "learner_id": learner_id},
        )
    ).mappings().all()
    return _build_learner_rollup(
        org_id=effective,
        learner_id=learner_id,
        rows=[dict(r) for r in rows],
        scenario_total=await _active_scenario_count(db),
    )


@router.get(
    "/competency/team",
    response_model=list[LearnerCompetency],
    summary="Competency rollup per learner across the organisation (admin only)",
)
async def get_team_competency(
    org_id: Optional[str] = Query(None, description="Scoped organisation id"),
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[LearnerCompetency]:
    """
    The zoomed-out ledger: one row per person instead of one row per session.

    Gated on view_team_competency rather than merely on org membership — the
    org-scoped read that used to back "My Progress" is exactly the leak this
    endpoint exists to replace with something deliberate.
    """
    effective = await bind_scoped_org(db, current_user, _resolve_org(current_user, org_id))
    _require_team_scope(current_user, "team")
    rows = (
        await db.execute(
            _ROLLUP_SQL,
            {"org_id": effective, "team": True, "learner_id": _learner_id(current_user)},
        )
    ).mappings().all()

    by_learner: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_learner.setdefault(str(row["learner_id"]), []).append(dict(row))

    scenario_total = await _active_scenario_count(db)
    rollups = [
        _build_learner_rollup(
            org_id=effective,
            learner_id=learner,
            rows=learner_rows,
            scenario_total=scenario_total,
        )
        for learner, learner_rows in by_learner.items()
    ]
    # Weakest first: a manager opens this to find who needs attention.
    rollups.sort(key=lambda r: (-len(r.gap_dimensions), r.display_name or r.learner_id))
    logger.info("learning_team_competency_listed", org_id=effective, learners=len(rollups))
    return rollups


@router.get("/sessions/{session_id}", response_model=SessionOut, summary="Get learning session state")
async def get_session(
    session_id: uuid.UUID,
    org_id: Optional[str] = Query(None, description="Scoped organisation id"),
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    effective = await bind_scoped_org(db, current_user, _resolve_org(current_user, org_id))
    row = await _fetch_session(db, session_id)
    if row is None:
        # RLS hides other-tenant rows — surface as 403 (Phase 2 isolation proof).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to access this learning session",
        )
    if str(row["org_id"]) != effective:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to access this learning session",
        )
    return _row_to_out(row)


def _grade_confidence(competency: dict[str, Any], moved: dict[str, int]) -> float:
    """
    How much the platform trusts its own automated grade of this decision, 0–1.

    Taken from the weakest dimension the decision moved, normalised to 0–1. The
    reasoning: an authored rationale is an adequate explanation for a learner who
    is broadly competent and slipped once, and an inadequate one for a learner who
    has just collapsed a dimension — that second case is where a human should read
    the transcript. Below CONFIDENCE_THRESHOLD the decision is routed for review,
    which is the same convention core/assessment_llm.py applies to control
    assessments.
    """
    affected = [dimension_score(competency, dim) for dim in moved] or [
        dimension_score(competency, dim) for dim in DIMENSIONS
    ]
    return max(0.0, min(1.0, min(affected) / 100.0))


async def _route_decision_for_review(
    db: AsyncSession,
    *,
    org_id: str,
    learner_id: str,
    session_id: str,
    content: Scenario,
    stage: str,
    choice_id: str,
    result: Any,
    actor: str,
) -> None:
    """
    Send a wrong expert-difficulty decision to the Review Queue when confidence is low.

    Restricted to expert difficulty on purpose. Foundation and practitioner
    scenarios are where a learner is expected to be wrong — routing those would
    bury the queue in noise and teach reviewers to ignore it. At expert difficulty
    a wrong answer is a signal about the person, not about the material.

    Non-fatal for the same reason as gap reconciliation: the graded session is the
    record of record and is already committed.
    """
    if result.correct or content.difficulty != EXPERT_DIFFICULTY:
        return

    confidence = _grade_confidence(result.updated_competency, result.dimension_deltas)
    if confidence >= CONFIDENCE_THRESHOLD:
        return

    controls = extract_controls(result.framework_rationale)
    try:
        item_id = await enqueue_learning_decision_review(
            db,
            org_id=org_id,
            session_id=session_id,
            learner_id=learner_id,
            scenario_slug=content.slug,
            scenario_title=content.title,
            stage=stage,
            choice_id=choice_id,
            control_id=controls[0] if controls else content.slug,
            confidence=confidence,
            severity=_review_severity(confidence),
            reference=result.framework_rationale or content.title,
        )
    except Exception as exc:
        logger.warning(
            "learning_decision_review_enqueue_failed",
            session_id=session_id,
            org_id=org_id,
            error=str(exc),
        )
        return

    await append_audit_log(
        db,
        event_type="learning.decision.review.enqueued",
        entity_type="human_review_item",
        entity_id=item_id,
        org_id=org_id,
        actor=actor,
        payload={
            "scenario": content.slug,
            "stage": stage,
            "choice": choice_id,
            "confidence": confidence,
            "learner_id": learner_id,
            "session_id": session_id,
        },
    )


def _review_severity(confidence: float) -> str:
    """Mirrors core/gaps._severity: distance below the bar, not the raw number."""
    if confidence < 0.35:
        return "CRITICAL"
    if confidence < 0.55:
        return "HIGH"
    return "MEDIUM"


async def _reconcile_gaps(
    db: AsyncSession,
    *,
    org_id: str,
    learner_id: str,
    session_id: str,
    content: Scenario,
    competency: dict[str, Any],
    actor: str,
) -> None:
    """
    Raise or settle the learner's control gaps for this scenario.

    Deliberately non-fatal: a learner who has just finished a scenario must still
    receive their result even if gap reconciliation fails. The gaps are derived
    data and are rebuilt on the next completion, whereas the graded session is the
    record of record and has already been committed above.
    """
    try:
        outcome = await reconcile_gaps_for_session(
            db,
            org_id=org_id,
            learner_id=learner_id,
            session_id=session_id,
            content=content,
            competency=competency,
        )
    except Exception as exc:
        logger.warning(
            "competency_gap_reconcile_failed",
            session_id=session_id,
            org_id=org_id,
            error=str(exc),
        )
        return

    if not (outcome["opened"] or outcome["closed"]):
        return

    await append_audit_log(
        db,
        event_type="learning.gaps.reconcile",
        entity_type="scenario_session",
        entity_id=session_id,
        org_id=org_id,
        actor=actor,
        payload={
            "scenario": content.slug,
            "opened": outcome["opened"],
            "closed": outcome["closed"],
        },
    )


def _build_debrief(row: Any, content: Scenario) -> DebriefOut:
    """
    Replay the recorded decisions against scenario content to produce the review.

    Decisions do not store the stage they were taken at, so the stage is
    reconstructed by walking the content's transitions from the entry stage. That
    walk is deterministic — next_stage lives on the choice row — and it is the
    same traversal decide() performed when the session was live.
    """
    state = _json_object(row["state"])
    competency = _json_object(row["competency"] if "competency" in row.keys() else {})
    decisions_raw = state.get("decisions") or []

    stage_slug = content.entry_stage.slug if content.entry_stage is not None else ENTRY_STAGE
    decisions: list[DebriefDecision] = []
    controls_seen: list[str] = []

    for index, entry in enumerate(decisions_raw, start=1):
        if not isinstance(entry, dict):
            continue
        chosen_id = str(entry.get("choice") or "")
        stage = content.stage(stage_slug)
        stage_choices = list(stage.choices) if stage is not None else []
        chosen = next((c for c in stage_choices if c.choice_id == chosen_id), None)
        reference = next((c for c in stage_choices if c.is_correct), None)

        graded = entry.get("graded") if isinstance(entry.get("graded"), dict) else {}
        # graded.rationale is the authoritative record: it is what the learner was
        # scored against at the time, even if content has been edited since.
        rationale = str(graded.get("rationale") or (chosen.framework_rationale if chosen else "") or "")
        observations = [str(o) for o in (graded.get("observations") or [])]
        correct = bool(graded.get("correct")) if "correct" in graded else bool(
            chosen.is_correct if chosen else False
        )

        reference_rationale = reference.framework_rationale if reference else None
        controls = extract_controls(rationale, reference_rationale)
        for ref in controls:
            if ref not in controls_seen:
                controls_seen.append(ref)

        decisions.append(
            DebriefDecision(
                sequence=index,
                stage=stage_slug,
                chosen_id=chosen_id,
                chosen_label=chosen.label if chosen else chosen_id,
                correct=correct,
                consequence=(chosen.consequence if chosen else "") or "",
                framework_rationale=rationale,
                reference_id=reference.choice_id if reference else None,
                reference_label=reference.label if reference else None,
                reference_rationale=reference_rationale,
                controls=controls,
                observations=observations,
            )
        )

        if chosen is not None:
            stage_slug = chosen.next_stage or TERMINAL_STAGE
        else:
            break

    weak = weak_dimensions(competency)
    dimensions = [
        DebriefDimension(
            dimension=dim,
            label=HUMAN_LABELS[dim],
            score=dimension_score(competency, dim),
            is_gap=dim in weak,
            observations=dimension_observations(competency, dim),
        )
        for dim in DIMENSIONS
    ]

    created = row["created_at"]
    updated = row["updated_at"]
    return DebriefOut(
        jurisdiction="internal",
        purpose_tags=["learning", "assessment"],
        session_id=str(row["id"]),
        scenario_slug=content.slug,
        scenario_title=content.title,
        difficulty=content.difficulty,
        frameworks=list(content.frameworks),
        brief=content.brief,
        stage=str(row["stage"]),
        risk=str(row["risk"]) if row["risk"] is not None else None,
        complete=str(row["stage"]) == TERMINAL_STAGE,
        decisions=decisions,
        competency=dimensions,
        controls_touched=controls_seen,
        gap_dimensions=weak,
        correct_count=sum(1 for d in decisions if d.correct),
        decision_count=len(decisions),
        created_at=created.isoformat() if hasattr(created, "isoformat") else None,
        updated_at=updated.isoformat() if hasattr(updated, "isoformat") else None,
    )


@router.get(
    "/sessions/{session_id}/debrief",
    response_model=DebriefOut,
    summary="Post-scenario debrief: chosen vs correct, rationale, control mapping",
)
async def get_debrief(
    session_id: uuid.UUID,
    org_id: Optional[str] = Query(None, description="Scoped organisation id"),
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DebriefOut:
    effective = await bind_scoped_org(db, current_user, _resolve_org(current_user, org_id))
    row = await _fetch_session(db, session_id)
    if row is None or str(row["org_id"]) != effective:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to access this learning session",
        )
    content = await _load_content(db, str(row["scenario"]))
    return _build_debrief(row, content)


@router.post(
    "/sessions/{session_id}/decide",
    response_model=SessionOut,
    summary="Advance the learning loop with a learner choice",
)
@limiter.limit("30/minute", key_func=authenticated_rate_limit_key)
async def decide(
    request: Request,
    session_id: uuid.UUID,
    body: DecideRequest,
    org_id: Optional[str] = Query(None, description="Scoped organisation id"),
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    effective = await bind_writable_org(db, current_user, _resolve_org(current_user, org_id))
    choice = body.choice.strip()
    actor = str(current_user.get("sub") or current_user.get("email") or "anonymous")

    row = await _fetch_session(db, session_id)
    if row is None or str(row["org_id"]) != effective:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to access this learning session",
        )

    # The session's own scenario defines what is choosable; _VALID_CHOICES only
    # backstops content that carries no choices at all.
    content = await _load_content(db, str(row["scenario"]))
    stage_before = str(row["stage"])

    # A graded session is final. Without this, any choice from a later stage
    # reopens it, rewriting the recorded risk and re-running the agent on every
    # call — so the assessed decision would not be the one that stands.
    if stage_before == TERMINAL_STAGE:
        logger.warning(
            "learning_decide_rejected_terminal",
            session_id=str(session_id),
            org_id=effective,
            actor=actor,
            choice=choice,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This learning session is complete and cannot be advanced.",
        )

    # Scope to the current stage: valid_choice_ids() is the union across every
    # stage, which would let a learner answer a stage they are not on.
    allowed = {c["id"] for c in content.choices_for_stage(stage_before)}
    if not allowed:
        allowed = set(content.valid_choice_ids()) or set(_VALID_CHOICES)
    if choice not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid choice '{choice}' for stage '{stage_before}'. Expected one of: {sorted(allowed)}",
        )

    state = row["state"]
    if isinstance(state, str):
        state = json.loads(state)

    start_hash = await append_audit_log(
        db,
        event_type="learning.session.decide.start",
        entity_type="scenario_session",
        entity_id=str(session_id),
        org_id=effective,
        actor=actor,
        payload={"choice": choice, "stage_before": row["stage"], "org_id": effective},
    )

    session_row = {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "scenario": str(row["scenario"]),
        "stage": str(row["stage"]),
        "risk": row["risk"],
        "state": dict(state or {}),
    }
    new_state, new_stage, new_risk, agent = await advance_after_decision(
        session_row=session_row,
        choice=choice,
        scenario=content,
    )

    stage_obj = content.stage(stage_before)
    scenario_choices = list(stage_obj.choices) if stage_obj is not None else []
    try:
        raw_competency = row["competency"]
    except (KeyError, TypeError):
        raw_competency = {}
    result = grade_decision(
        choice_id=choice,
        stage=stage_before,
        scenario_choices=scenario_choices,
        current_competency=_json_object(raw_competency),
        decisions_so_far=list(new_state.get("decisions") or []),
    )
    decisions = list(new_state.get("decisions") or [])
    if decisions:
        last = dict(decisions[-1])
        last["graded"] = {
            "correct": result.correct,
            "rationale": result.framework_rationale,
            "observations": result.observations,
        }
        decisions[-1] = last
        new_state["decisions"] = decisions

    updated = await db.execute(
        text(
            """
            UPDATE scenario_sessions
            SET state = CAST(:state AS jsonb),
                stage = :stage,
                risk = :risk,
                competency = CAST(:competency AS jsonb),
                updated_at = NOW()
            WHERE id = :id
            RETURNING id, org_id, scenario, learner_id, state, stage, risk, competency, created_at, updated_at
            """
        ),
        {
            "id": str(session_id),
            "state": json.dumps(new_state),
            "stage": new_stage,
            "risk": new_risk,
            "competency": json.dumps(result.updated_competency),
        },
    )
    out_row = updated.mappings().first()
    assert out_row is not None

    await append_audit_log(
        db,
        event_type="learning.session.decide.complete",
        entity_type="scenario_session",
        entity_id=str(session_id),
        org_id=effective,
        actor=actor,
        prev_hash_override=start_hash,
        payload={
            "choice": choice,
            "stage": new_stage,
            "risk": new_risk,
            "org_id": effective,
            "harness_speaker": agent.speaker,
            "harness_stance": agent.stance,
        },
    )

    # Per decision, not per session: the reviewer needs the specific stage and
    # choice, which the final competency rollup no longer distinguishes.
    await _route_decision_for_review(
        db,
        org_id=effective,
        learner_id=str(out_row["learner_id"]),
        session_id=str(session_id),
        content=content,
        stage=stage_before,
        choice_id=choice,
        result=result,
        actor=actor,
    )

    # Terminal stage is the only point at which competency is final, so it is the
    # only honest point to raise or settle control gaps from it.
    if new_stage == TERMINAL_STAGE:
        await _reconcile_gaps(
            db,
            org_id=effective,
            learner_id=str(out_row["learner_id"]),
            session_id=str(session_id),
            content=content,
            competency=result.updated_competency,
            actor=actor,
        )

    logger.info(
        "learning_session_decided",
        session_id=str(session_id),
        choice=choice,
        risk=new_risk,
        stage=new_stage,
    )
    return _row_to_out(out_row)
