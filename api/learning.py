# api/learning.py — Learning Loop v1 controller (deterministic; agent consulted via harness).

from __future__ import annotations

import json
import hashlib
import uuid
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.limits import authenticated_rate_limit_key, limiter
from core.agents.grading import grade_decision
from core.agents.scenario import (
    ENTRY_STAGE,
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
from core.governance import SovereignModel
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
    # Older API clients can still replay historical fixtures without these
    # fields; the learner UI requires both before enabling submission.
    rationale: Optional[str] = Field(default=None, min_length=10, max_length=4000)
    confidence: Optional[float] = Field(default=None, ge=0, le=1)


class ScenarioSummary(BaseModel):
    """Shared curriculum row — not tenant-owned (no org_id / RLS)."""

    slug: str
    title: str
    brief: str
    track: str
    frameworks: list[str]
    difficulty: str
    source_skill_id: Optional[str] = None
    source_skill_version: Optional[str] = None
    source_review_state: Optional[str] = None
    practice_area: Optional[str] = None
    estimated_minutes: Optional[int] = None
    learning_objectives: list[str] = Field(default_factory=list)


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
    scenario_version_id: Optional[str] = None
    track_version_id: Optional[str] = None
    learner_rationale: Optional[str] = None
    learner_confidence: Optional[float] = None


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
    risk_outcome: Optional[str] = None
    consequence: str
    framework_rationale: str
    reference_id: Optional[str] = None
    reference_label: Optional[str] = None
    reference_rationale: Optional[str] = None
    controls: list[str] = Field(default_factory=list)
    observations: list[str] = Field(default_factory=list)
    decided_at: Optional[str] = None
    learner_rationale: Optional[str] = None
    learner_confidence: Optional[float] = None


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
    source_skill_id: Optional[str] = None
    source_skill_version: Optional[str] = None
    source_skill_url: Optional[str] = None
    source_skill_hash: Optional[str] = None
    source_skill_license: Optional[str] = None
    source_review_state: Optional[str] = None
    scenario_version: Optional[int] = None
    scenario_content_hash: Optional[str] = None
    agent_provenance: list[dict[str, Any]] = Field(default_factory=list)
    learning_objectives: list[str] = Field(default_factory=list)
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
        scenario_version_id=(
            str(row["scenario_version_id"])
            if "scenario_version_id" in row.keys() and row["scenario_version_id"]
            else None
        ),
        track_version_id=(
            str(row["track_version_id"])
            if "track_version_id" in row.keys() and row["track_version_id"]
            else None
        ),
        learner_rationale=(
            str(row["learner_rationale"])
            if "learner_rationale" in row.keys() and row["learner_rationale"] is not None
            else None
        ),
        learner_confidence=(
            float(row["learner_confidence"])
            if "learner_confidence" in row.keys() and row["learner_confidence"] is not None
            else None
        ),
    )


async def _load_content(
    session: AsyncSession,
    slug: str,
    *,
    version_id: str | None = None,
) -> Scenario:
    """Resolve scenario content, mapping an unknown slug to a 400 rather than a 500."""
    try:
        return await load_scenario(slug, session, version_id=version_id)
    except ScenarioNotFound:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown scenario '{slug}'",
        ) from None


async def _fetch_session(session: AsyncSession, session_id: uuid.UUID) -> Any | None:
    result = await session.execute(
        text(
            """
            SELECT id, org_id, scenario, learner_id, state, stage, risk, competency,
                   scenario_version_id, track_version_id, learner_rationale,
                   learner_confidence, created_at, updated_at
            FROM scenario_sessions
            WHERE id = :id
            """
        ),
        {"id": str(session_id)},
    )
    return result.mappings().first()


async def _resolve_curriculum_pins(
    session: AsyncSession,
    scenario_slug: str,
) -> tuple[str | None, str | None]:
    """Pin the newest published scenario and its published track at enrollment time."""
    row = (
        await session.execute(
            text(
                """
                SELECT sv.id AS scenario_version_id, tm.track_version_id
                FROM scenario_versions sv
                JOIN scenarios s ON s.id = sv.scenario_id
                LEFT JOIN track_memberships tm ON tm.scenario_version_id = sv.id
                LEFT JOIN track_versions tv
                  ON tv.id = tm.track_version_id AND tv.status = 'published'
                WHERE s.slug = :slug AND sv.status = 'published'
                ORDER BY sv.version DESC, tv.version DESC NULLS LAST
                LIMIT 1
                """
            ),
            {"slug": scenario_slug},
        )
    ).mappings().first()
    if row is None:
        return None, None
    return (
        str(row["scenario_version_id"]),
        str(row["track_version_id"]) if row["track_version_id"] else None,
    )


async def _assert_prerequisites_complete(
    session: AsyncSession,
    *,
    learner_id: str,
    track_version_id: str | None,
) -> None:
    """Refuse starts that the published learning plan marks as locked."""
    if track_version_id is None:
        return
    blocked = (
        await session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM track_prerequisites tp
                  WHERE tp.track_version_id = CAST(:track_version_id AS uuid)
                    AND NOT EXISTS (
                      SELECT 1
                      FROM curriculum_enrollments ce
                      WHERE ce.learner_id = :learner_id
                        AND ce.track_version_id = tp.prerequisite_track_version_id
                        AND ce.status = 'completed'
                    )
                )
                """
            ),
            {
                "track_version_id": track_version_id,
                "learner_id": learner_id,
            },
        )
    ).scalar_one()
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Practice prerequisites are not yet complete",
        )


async def _persist_agent_turn(
    session: AsyncSession,
    *,
    org_id: str,
    session_id: str,
    response: Any,
) -> None:
    """Append the validated response and explicit origin as immutable provenance."""
    provenance = response.provenance
    if provenance is None:
        raise RuntimeError("validated agent response is missing provenance")
    payload = response.model_dump(mode="json")
    response_hash = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    await session.execute(
        text(
            """
            INSERT INTO agent_turns (
              org_id, session_id, sequence, provenance_type, provider, model,
              fixture_version, response_hash, response
            )
            SELECT :org_id, CAST(:session_id AS uuid), COALESCE(MAX(sequence), 0) + 1,
                   :provenance_type, :provider, :model, :fixture_version,
                   :response_hash, CAST(:response AS jsonb)
            FROM agent_turns
            WHERE session_id = CAST(:session_id AS uuid)
            """
        ),
        {
            "org_id": org_id,
            "session_id": session_id,
            "provenance_type": provenance.type,
            "provider": provenance.provider,
            "model": provenance.model,
            "fixture_version": provenance.fixture_version,
            "response_hash": response_hash,
            "response": json.dumps(payload),
        },
    )


def _require_session_owner(row: Any, current_user: dict[str, Any]) -> None:
    """Learner endpoints never permit one tenant member to act as another learner."""
    if str(row["learner_id"]) != _learner_id(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to access this learning session",
        )


def _frameworks_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item) for item in value]
    return [str(value)]


def _display_control_ref(value: str) -> str:
    """Render canonical registry ids in the learner-facing reference format."""
    ref = value.strip()
    lowered = ref.lower()
    if lowered.startswith("a."):
        return f"A.{ref[2:]}"
    if lowered.startswith("clause."):
        return f"Clause {ref[7:]}"
    return ref


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
            SELECT slug, title, brief, track, frameworks, difficulty, to_jsonb(s) AS extra
            FROM scenarios
            AS s
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
    summaries: list[ScenarioSummary] = []
    for row in result.mappings().all():
        extra = _json_object(row["extra"])
        objectives = extra.get("learning_objectives")
        summaries.append(
            ScenarioSummary(
            slug=str(row["slug"]),
            title=str(row["title"]),
            brief=str(row["brief"]),
            track=str(row["track"]),
            frameworks=_frameworks_list(row["frameworks"]),
            difficulty=str(row["difficulty"]),
            source_skill_id=extra.get("source_skill_id"),
            source_skill_version=extra.get("source_skill_version"),
            source_review_state=extra.get("source_review_state"),
            practice_area=extra.get("practice_area"),
            estimated_minutes=extra.get("estimated_minutes"),
            learning_objectives=(
                [str(item) for item in objectives]
                if isinstance(objectives, list)
                else []
            ),
        )
        )
    return summaries


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
    scenario_version_id, track_version_id = await _resolve_curriculum_pins(db, scenario)
    learner_id = str(current_user.get("sub") or current_user.get("email") or "anonymous")
    await _assert_prerequisites_complete(
        db,
        learner_id=learner_id,
        track_version_id=track_version_id,
    )
    content = await _load_content(db, scenario, version_id=scenario_version_id)
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
        "scenario_version_id": scenario_version_id,
        "scenario_content_hash": content.content_hash,
        "track_version_id": track_version_id,
    }
    insert = await db.execute(
        text(
            """
            INSERT INTO scenario_sessions (
              org_id, scenario, learner_id, state, stage, risk, framework, audit_type,
              scenario_version_id, track_version_id
            )
            VALUES (
              :org_id, :scenario, :learner_id, CAST(:state AS jsonb), :stage, NULL,
              :framework, :audit_type, CAST(:scenario_version_id AS uuid),
              CAST(:track_version_id AS uuid)
            )
            RETURNING id, org_id, scenario, learner_id, state, stage, risk, competency,
                      scenario_version_id, track_version_id, learner_rationale,
                      learner_confidence, created_at, updated_at
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
            "scenario_version_id": scenario_version_id,
            "track_version_id": track_version_id,
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
    full_state["scenario_version_id"] = scenario_version_id
    full_state["scenario_content_hash"] = content.content_hash
    full_state["track_version_id"] = track_version_id

    updated = await db.execute(
        text(
            """
            UPDATE scenario_sessions
            SET state = CAST(:state AS jsonb),
                stage = :stage,
                updated_at = NOW()
            WHERE id = :id
            RETURNING id, org_id, scenario, learner_id, state, stage, risk, competency,
                      scenario_version_id, track_version_id, learner_rationale,
                      learner_confidence, created_at, updated_at
            """
        ),
        {"id": session_id, "state": json.dumps(full_state), "stage": entry_stage},
    )
    out_row = updated.mappings().first()
    assert out_row is not None
    await _persist_agent_turn(
        db,
        org_id=effective,
        session_id=session_id,
        response=opening,
    )
    if track_version_id is not None:
        await db.execute(
            text(
                """
                INSERT INTO curriculum_enrollments (
                  org_id, learner_id, track_version_id
                ) VALUES (:org_id, :learner_id, CAST(:track_version_id AS uuid))
                ON CONFLICT (org_id, learner_id, track_version_id) DO NOTHING
                """
            ),
            {
                "org_id": effective,
                "learner_id": learner_id,
                "track_version_id": track_version_id,
            },
        )
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
            "scenario_version_id": scenario_version_id,
            "track_version_id": track_version_id,
            "agent_provenance": opening.provenance.type if opening.provenance else None,
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


async def _track_scenario_count(db: AsyncSession, learner_id: str) -> int:
    """Required membership count for the learner's pinned track, never a global catalog count."""
    try:
        total = (
            await db.execute(
                text(
                    """
                    SELECT count(*)
                    FROM track_memberships tm
                    WHERE tm.required
                      AND tm.track_version_id = (
                        SELECT ss.track_version_id
                        FROM scenario_sessions ss
                        WHERE ss.learner_id = :learner_id
                          AND ss.track_version_id IS NOT NULL
                        ORDER BY ss.updated_at DESC
                        LIMIT 1
                      )
                    """
                ),
                {"learner_id": learner_id},
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
    current_track = next(
        (
            str(row["track_version_id"])
            for row in reversed(rows)
            if row.get("track_version_id") is not None
        ),
        None,
    )
    completed = {
        str(r.get("scenario") or "")
        for r in rows
        if str(r.get("stage") or "") == TERMINAL_STAGE
        and (
            current_track is None
            or str(r.get("track_version_id") or "") == current_track
        )
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
           ss.track_version_id,
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
        scenario_total=await _track_scenario_count(db, learner_id),
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

    rollups = [
        _build_learner_rollup(
            org_id=effective,
            learner_id=learner,
            rows=learner_rows,
            scenario_total=await _track_scenario_count(db, learner),
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
    _require_session_owner(row, current_user)
    return _row_to_out(row)


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
        stage_slug = str(entry.get("stage") or stage_slug)
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
        structured_controls = [
            _display_control_ref(ref)
            for ref in [
                *(chosen.control_refs if chosen else ()),
                *(reference.control_refs if reference else ()),
            ]
        ]
        controls = list(dict.fromkeys(structured_controls)) or extract_controls(
            rationale,
            reference_rationale,
        )
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
                risk_outcome=chosen.risk_outcome if chosen else None,
                consequence=(chosen.consequence if chosen else "") or "",
                framework_rationale=rationale,
                reference_id=reference.choice_id if reference else None,
                reference_label=reference.label if reference else None,
                reference_rationale=reference_rationale,
                controls=controls,
                observations=observations,
                decided_at=str(entry.get("at")) if entry.get("at") else None,
                learner_rationale=(
                    str(entry.get("rationale")) if entry.get("rationale") is not None else None
                ),
                learner_confidence=(
                    float(entry["confidence"]) if entry.get("confidence") is not None else None
                ),
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
    provenance = [
        dict(message["provenance"])
        for message in (state.get("messages") or [])
        if isinstance(message, dict) and isinstance(message.get("provenance"), dict)
    ]
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
        source_skill_id=content.source_skill_id,
        source_skill_version=content.source_skill_version,
        source_skill_url=content.source_skill_url,
        source_skill_hash=content.source_skill_hash,
        source_skill_license=content.source_skill_license,
        source_review_state=content.source_review_state,
        scenario_version=content.version,
        scenario_content_hash=(
            str(state.get("scenario_content_hash"))
            if state.get("scenario_content_hash")
            else content.content_hash
        ),
        agent_provenance=provenance,
        learning_objectives=list(content.learning_objectives),
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
    _require_session_owner(row, current_user)
    content = await _load_content(
        db,
        str(row["scenario"]),
        version_id=(
            str(row["scenario_version_id"]) if row["scenario_version_id"] else None
        ),
    )
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
    _require_session_owner(row, current_user)

    # The session's own scenario defines what is choosable; _VALID_CHOICES only
    # backstops content that carries no choices at all.
    content = await _load_content(
        db,
        str(row["scenario"]),
        version_id=(
            str(row["scenario_version_id"]) if row["scenario_version_id"] else None
        ),
    )
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
        last["stage"] = stage_before
        last["rationale"] = body.rationale
        last["confidence"] = body.confidence
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
                learner_rationale = :learner_rationale,
                learner_confidence = :learner_confidence,
                updated_at = NOW()
            WHERE id = :id
            RETURNING id, org_id, scenario, learner_id, state, stage, risk, competency,
                      scenario_version_id, track_version_id, learner_rationale,
                      learner_confidence, created_at, updated_at
            """
        ),
        {
            "id": str(session_id),
            "state": json.dumps(new_state),
            "stage": new_stage,
            "risk": new_risk,
            "competency": json.dumps(result.updated_competency),
            "learner_rationale": body.rationale,
            "learner_confidence": body.confidence,
        },
    )
    out_row = updated.mappings().first()
    assert out_row is not None
    await _persist_agent_turn(
        db,
        org_id=effective,
        session_id=str(session_id),
        response=agent,
    )

    if new_stage == TERMINAL_STAGE and out_row["scenario_version_id"] is not None:
        enrollment_id = None
        if out_row["track_version_id"] is not None:
            enrollment_id = (
                await db.execute(
                    text(
                        """
                        SELECT id FROM curriculum_enrollments
                        WHERE org_id = :org_id AND learner_id = :learner_id
                          AND track_version_id = :track_version_id
                        """
                    ),
                    {
                        "org_id": effective,
                        "learner_id": str(out_row["learner_id"]),
                        "track_version_id": out_row["track_version_id"],
                    },
                )
            ).scalar_one_or_none()
        await db.execute(
            text(
                """
                INSERT INTO curriculum_completions (
                  org_id, learner_id, enrollment_id, scenario_version_id, session_id
                ) VALUES (
                  :org_id, :learner_id, :enrollment_id, :scenario_version_id, :session_id
                )
                ON CONFLICT (session_id) DO NOTHING
                """
            ),
            {
                "org_id": effective,
                "learner_id": str(out_row["learner_id"]),
                "enrollment_id": enrollment_id,
                "scenario_version_id": out_row["scenario_version_id"],
                "session_id": out_row["id"],
            },
        )
        if enrollment_id is not None:
            await db.execute(
                text(
                    """
                    UPDATE curriculum_enrollments ce
                    SET status = 'completed', completed_at = NOW()
                    WHERE ce.id = :enrollment_id
                      AND NOT EXISTS (
                        SELECT 1
                        FROM track_memberships tm
                        WHERE tm.track_version_id = ce.track_version_id
                          AND tm.required
                          AND NOT EXISTS (
                            SELECT 1
                            FROM curriculum_completions cc
                            WHERE cc.org_id = ce.org_id
                              AND cc.learner_id = ce.learner_id
                              AND cc.scenario_version_id = tm.scenario_version_id
                          )
                      )
                    """
                ),
                {"enrollment_id": enrollment_id},
            )

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
            "scenario_version_id": (
                str(out_row["scenario_version_id"])
                if out_row["scenario_version_id"] is not None
                else None
            ),
            "learner_confidence": body.confidence,
            "rationale_supplied": body.rationale is not None,
            "agent_provenance": agent.provenance.type if agent.provenance else None,
        },
    )

    logger.info(
        "learning_session_decided",
        session_id=str(session_id),
        choice=choice,
        risk=new_risk,
        stage=new_stage,
    )
    return _row_to_out(out_row)
