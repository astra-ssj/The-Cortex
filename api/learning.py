# api/learning.py — Learning Loop v1 controller (deterministic; agent consulted via harness).

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from compliance.models import SovereignModel
from core.agents.scenario import (
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
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, bind_scoped_org, resolve_scoped_org_id

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

    def resolved_slug(self) -> str:
        for candidate in (self.scenario_slug, self.scenario):
            if candidate and candidate.strip():
                return candidate.strip()
        return SCENARIO_ID


class DecideRequest(BaseModel):
    choice: str = Field(..., min_length=1, description="Learner choice id")


class SessionOut(SovereignModel):
    """Org-scoped learning session — inherits jurisdiction + purpose tags (ZTAIP)."""

    id: str
    org_id: str
    scenario: str
    learner_id: str
    state: dict[str, Any]
    stage: str
    risk: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


def _resolve_org(current_user: dict[str, Any], requested: Optional[str]) -> str:
    if requested and requested.strip():
        return resolve_scoped_org_id(current_user, requested.strip())
    return str(current_user.get("org_id") or DEMO_ORG_ID).strip()


def _row_to_out(row: Any) -> SessionOut:
    created = row["created_at"]
    updated = row["updated_at"]
    state = row["state"]
    if isinstance(state, str):
        state = json.loads(state)
    return SessionOut(
        jurisdiction="internal",
        purpose_tags=["learning", "onboarding", "agent-harness"],
        id=str(row["id"]),
        org_id=str(row["org_id"]),
        scenario=str(row["scenario"]),
        learner_id=str(row["learner_id"]),
        state=dict(state or {}),
        stage=str(row["stage"]),
        risk=str(row["risk"]) if row["risk"] is not None else None,
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
            SELECT id, org_id, scenario, learner_id, state, stage, risk, created_at, updated_at
            FROM scenario_sessions
            WHERE id = :id
            """
        ),
        {"id": str(session_id)},
    )
    return result.mappings().first()


@router.post("/sessions", response_model=SessionOut, summary="Create a learning scenario session")
async def create_session(
    body: CreateSessionRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    effective = await bind_scoped_org(db, current_user, _resolve_org(current_user, body.org_id))
    scenario = body.resolved_slug()
    content = await _load_content(db, scenario)
    learner_id = str(current_user.get("sub") or current_user.get("email") or "anonymous")

    await append_audit_log(
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
            INSERT INTO scenario_sessions (org_id, scenario, learner_id, state, stage, risk)
            VALUES (
              :org_id, :scenario, :learner_id, CAST(:state AS jsonb), 'access_request', NULL
            )
            RETURNING id, org_id, scenario, learner_id, state, stage, risk, created_at, updated_at
            """
        ),
        {
            "org_id": effective,
            "scenario": scenario,
            "learner_id": learner_id,
            "state": json.dumps(seed_state),
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
            "stage": "access_request",
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
                stage = 'access_request',
                updated_at = NOW()
            WHERE id = :id
            RETURNING id, org_id, scenario, learner_id, state, stage, risk, created_at, updated_at
            """
        ),
        {"id": session_id, "state": json.dumps(full_state)},
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
        payload={
            "scenario": scenario,
            "org_id": effective,
            "stage": "access_request",
            "harness_speaker": opening.speaker,
        },
    )
    logger.info("learning_session_created", session_id=session_id, org_id=effective)
    return _row_to_out(out_row)


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


@router.post(
    "/sessions/{session_id}/decide",
    response_model=SessionOut,
    summary="Advance the learning loop with a learner choice",
)
async def decide(
    session_id: uuid.UUID,
    body: DecideRequest,
    org_id: Optional[str] = Query(None, description="Scoped organisation id"),
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionOut:
    effective = await bind_scoped_org(db, current_user, _resolve_org(current_user, org_id))
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

    await append_audit_log(
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

    updated = await db.execute(
        text(
            """
            UPDATE scenario_sessions
            SET state = CAST(:state AS jsonb),
                stage = :stage,
                risk = :risk,
                updated_at = NOW()
            WHERE id = :id
            RETURNING id, org_id, scenario, learner_id, state, stage, risk, created_at, updated_at
            """
        ),
        {
            "id": str(session_id),
            "state": json.dumps(new_state),
            "stage": new_stage,
            "risk": new_risk,
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
        payload={
            "choice": choice,
            "stage": new_stage,
            "risk": new_risk,
            "org_id": effective,
            "harness_speaker": agent.speaker,
            "harness_stance": agent.stance,
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
