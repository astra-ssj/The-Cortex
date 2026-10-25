"""Tenant-scoped deterministic onboarding diagnostic."""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from core.audit_fabric import append_audit_log
from core.diagnostic import (
    DIAGNOSTIC_QUESTIONS,
    AuthoredDiagnosticResponse,
    DiagnosticProfile,
    DiagnosticRecommendation,
    recommend,
)
from core.governance import SovereignModel
from core.security import get_current_user
from core.tenant import bind_writable_org

router = APIRouter(prefix="/api/v1/diagnostic", tags=["diagnostic"])


class CreateAttemptBody(DiagnosticProfile):
    pass


class SubmitResponsesBody(BaseModel):
    responses: list[AuthoredDiagnosticResponse] = Field(..., min_length=3, max_length=3)


class SkipBody(BaseModel):
    rationale: str = Field(..., min_length=10, max_length=2000)


class AttemptOut(SovereignModel):
    id: str
    org_id: str
    learner_id: str
    role: str
    experience_level: str
    target_framework: str
    learning_goal: str
    status: str
    questions: list[dict[str, str]] = Field(default_factory=list)
    recommendation: DiagnosticRecommendation | None = None


def _learner(current_user: dict[str, Any]) -> str:
    return str(current_user.get("sub") or current_user.get("email") or "anonymous")


async def _scope(db: AsyncSession, current_user: dict[str, Any]) -> tuple[str, str]:
    org_id = str(current_user.get("org_id") or "")
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing organisation")
    return await bind_writable_org(db, current_user, org_id), _learner(current_user)


@router.post("/attempts", response_model=AttemptOut)
async def create_attempt(
    body: CreateAttemptBody,
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttemptOut:
    org_id, learner_id = await _scope(db, current_user)
    before = await append_audit_log(
        db,
        event_type="diagnostic.attempt.create.start",
        entity_type="diagnostic_attempt",
        entity_id=None,
        org_id=org_id,
        actor=learner_id,
        payload={"target_framework": body.target_framework},
    )
    row = (
        await db.execute(
            text(
                """
                INSERT INTO diagnostic_attempts (
                  org_id, learner_id, role, experience_level, target_framework,
                  learning_goal, jurisdiction, purpose_tags
                ) VALUES (
                  :org_id, :learner_id, :role, :experience, :framework, :goal,
                  :jurisdiction, CAST(:purpose_tags AS jsonb)
                )
                RETURNING id::text
                """
            ),
            {
                "org_id": org_id,
                "learner_id": learner_id,
                "role": body.role,
                "experience": body.experience_level,
                "framework": body.target_framework,
                "goal": body.learning_goal,
                "jurisdiction": body.jurisdiction,
                "purpose_tags": json.dumps(body.purpose_tags),
            },
        )
    ).mappings().one()
    attempt_id = str(row["id"])
    await append_audit_log(
        db,
        event_type="diagnostic.attempt.create.complete",
        entity_type="diagnostic_attempt",
        entity_id=attempt_id,
        org_id=org_id,
        actor=learner_id,
        prev_hash_override=before,
        payload={"status": "in_progress"},
    )
    return AttemptOut(
        **body.model_dump(),
        id=attempt_id,
        org_id=org_id,
        learner_id=learner_id,
        status="in_progress",
        questions=list(DIAGNOSTIC_QUESTIONS),
    )


@router.post("/attempts/{attempt_id}/complete", response_model=AttemptOut)
async def complete_attempt(
    attempt_id: uuid.UUID,
    body: SubmitResponsesBody,
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttemptOut:
    org_id, learner_id = await _scope(db, current_user)
    row = (
        await db.execute(
            text(
                """
                SELECT id::text, role, experience_level, target_framework, learning_goal,
                       jurisdiction, purpose_tags, status
                FROM diagnostic_attempts
                WHERE id = :id AND learner_id = :learner_id
                """
            ),
            {"id": str(attempt_id), "learner_id": learner_id},
        )
    ).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Diagnostic attempt not found")
    if row["status"] != "in_progress":
        raise HTTPException(status_code=409, detail="Diagnostic attempt is already final")

    profile = DiagnosticProfile(
        jurisdiction=str(row["jurisdiction"]),
        purpose_tags=list(row["purpose_tags"] or []),
        role=str(row["role"]),
        experience_level=str(row["experience_level"]),
        target_framework=str(row["target_framework"]),
        learning_goal=str(row["learning_goal"]),
    )
    tracks = [
        dict(item)
        for item in (
            await db.execute(
                text(
                    "SELECT id::text AS version_id, track_id, title FROM track_versions "
                    "WHERE status = 'published' ORDER BY version DESC, track_id"
                )
            )
        ).mappings()
    ]
    practices = [
        dict(item)
        for item in (
            await db.execute(
                text(
                    """
                    SELECT pv.id::text AS version_id, pv.practice_id, pv.title, pv.summary,
                           COALESCE(s.frameworks, ARRAY[]::text[]) AS frameworks,
                           COALESCE(s.difficulty, 'foundation') AS difficulty
                    FROM practice_versions pv
                    LEFT JOIN scenario_versions s ON s.practice_version_id = pv.id
                      AND s.status = 'published'
                    WHERE pv.status = 'published'
                    ORDER BY pv.practice_id, pv.version DESC
                    """
                )
            )
        ).mappings()
    ]
    try:
        recommendation = recommend(profile, body.responses, tracks=tracks, practices=practices)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    before = await append_audit_log(
        db,
        event_type="diagnostic.attempt.complete.start",
        entity_type="diagnostic_attempt",
        entity_id=str(attempt_id),
        org_id=org_id,
        actor=learner_id,
        payload={"response_count": len(body.responses)},
    )
    for response in body.responses:
        await db.execute(
            text(
                """
                INSERT INTO diagnostic_responses (
                  org_id, attempt_id, question_id, response, rationale, confidence,
                  jurisdiction, purpose_tags
                ) VALUES (
                  :org_id, :attempt_id, :question_id, :response, :rationale, :confidence,
                  :jurisdiction, CAST(:purpose_tags AS jsonb)
                )
                """
            ),
            {
                "org_id": org_id,
                "attempt_id": str(attempt_id),
                **response.model_dump(exclude={"purpose_tags"}),
                "purpose_tags": json.dumps(response.purpose_tags),
            },
        )
    track = next((item for item in tracks if item["track_id"] == recommendation.track_id), None)
    practice = next(
        (item for item in practices if item["practice_id"] == recommendation.practice_id),
        None,
    )
    await db.execute(
        text(
            """
            INSERT INTO diagnostic_recommendations (
              org_id, attempt_id, track_version_id, recommended_practice_version_id,
              rationale, confidence, algorithm_version, jurisdiction, purpose_tags
            ) VALUES (
              :org_id, :attempt_id, CAST(:track_version_id AS uuid),
              CAST(:practice_version_id AS uuid), :rationale, :confidence,
              :algorithm_version, :jurisdiction, CAST(:purpose_tags AS jsonb)
            )
            """
        ),
        {
            "org_id": org_id,
            "attempt_id": str(attempt_id),
            "track_version_id": track["version_id"] if track else None,
            "practice_version_id": practice["version_id"] if practice else None,
            **recommendation.model_dump(exclude={"track_id", "practice_id", "purpose_tags"}),
            "purpose_tags": json.dumps(recommendation.purpose_tags),
        },
    )
    await db.execute(
        text(
            "UPDATE diagnostic_attempts SET status = 'completed', completed_at = NOW() "
            "WHERE id = :id"
        ),
        {"id": str(attempt_id)},
    )
    await db.execute(
        text(
            "UPDATE organizations SET onboarding_complete = TRUE, onboarding_step = 3, "
            "updated_at = NOW() WHERE id = :org_id"
        ),
        {"org_id": org_id},
    )
    await append_audit_log(
        db,
        event_type="diagnostic.attempt.complete",
        entity_type="diagnostic_attempt",
        entity_id=str(attempt_id),
        org_id=org_id,
        actor=learner_id,
        prev_hash_override=before,
        payload={
            "track_id": recommendation.track_id,
            "practice_id": recommendation.practice_id,
            "confidence": recommendation.confidence,
        },
    )
    return AttemptOut(
        **profile.model_dump(),
        id=str(attempt_id),
        org_id=org_id,
        learner_id=learner_id,
        status="completed",
        questions=list(DIAGNOSTIC_QUESTIONS),
        recommendation=recommendation,
    )


@router.post("/skip")
async def skip_diagnostic(
    body: SkipBody,
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    org_id, learner_id = await _scope(db, current_user)
    before = await append_audit_log(
        db,
        event_type="diagnostic.skip.start",
        entity_type="organization",
        entity_id=org_id,
        org_id=org_id,
        actor=learner_id,
        payload={"rationale": body.rationale},
    )
    await db.execute(
        text(
            """
            INSERT INTO diagnostic_attempts (
              org_id, learner_id, role, experience_level, target_framework,
              learning_goal, status, completed_at
            ) VALUES (
              :org_id, :learner_id, 'not_provided', 'new', 'not_provided',
              :rationale, 'skipped', NOW()
            )
            """
        ),
        {"org_id": org_id, "learner_id": learner_id, "rationale": body.rationale},
    )
    await db.execute(
        text(
            "UPDATE organizations SET onboarding_complete = TRUE, onboarding_step = 3, "
            "updated_at = NOW() WHERE id = :org_id"
        ),
        {"org_id": org_id},
    )
    await append_audit_log(
        db,
        event_type="diagnostic.skip.complete",
        entity_type="organization",
        entity_id=org_id,
        org_id=org_id,
        actor=learner_id,
        prev_hash_override=before,
        payload={"audited": True},
    )
    return {"onboarding_complete": True, "audited": True}
