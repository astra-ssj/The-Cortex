"""Instructor workflows with explicit tenant, ownership, and permission checks."""

from __future__ import annotations

import csv
import io
import json
import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.limits import authenticated_rate_limit_key, limiter
from core.agents.narration import audit_invoked_narration, briefing_facts, narrate
from core.audit_fabric import append_audit_log
from core.governance import SovereignModel
from core.instruction import (
    Assignment,
    CoachingNote,
    Cohort,
    LearnerProgress,
    assignment_progress,
    governed,
    iso,
    list_cohorts,
)
from core.rbac import Permission, require_permission, user_has_permission
from core.security import get_current_user
from core.tenant import DEMO_ORG_ID, bind_scoped_org, bind_writable_org

router = APIRouter(prefix="/api/v1/instruction", tags=["instruction"])


class CohortInput(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)


class CohortPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    status: Literal["active", "archived"] | None = None


class MembershipInput(BaseModel):
    learner_ids: list[str] = Field(default_factory=list, max_length=500)


class AssignmentInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    instructions: str = Field(default="", max_length=8000)
    cohort_id: str | None = None
    due_at: str | None = None
    status: Literal["draft", "published", "closed", "archived"] = "draft"
    practices: list[str] = Field(default_factory=list, max_length=100)
    learner_ids: list[str] = Field(default_factory=list, max_length=500)


class AssignmentPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    instructions: str | None = Field(default=None, max_length=8000)
    due_at: str | None = None
    status: Literal["draft", "published", "closed", "archived"] | None = None
    practices: list[str] | None = Field(default=None, max_length=100)
    learner_ids: list[str] | None = Field(default=None, max_length=500)


class AssignmentStatusInput(BaseModel):
    status: Literal["in_progress", "completed"]


class BriefingInput(BaseModel):
    cohort_id: str | None = None


class CohortBriefing(SovereignModel):
    cohort_id: str | None = None
    narrative: str
    cited_facts: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    source: Literal["local_model", "deterministic"]
    requires_human_review: bool
    suggested_practice_id: str | None = None
    provider: str
    model: str


class NoteInput(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
    visibility: Literal["learner_visible", "private"]
    cohort_id: str | None = None
    assignment_id: str | None = None


def _org(user: dict[str, Any], requested: str | None) -> str:
    return (requested or str(user.get("org_id") or DEMO_ORG_ID)).strip()


def _actor(user: dict[str, Any]) -> str:
    return str(user.get("sub") or user.get("email") or "anonymous")


async def _audit_pair(
    db: AsyncSession,
    *,
    event: str,
    entity: str,
    entity_id: str | None,
    org_id: str,
    actor: str,
    payload: dict[str, Any],
) -> None:
    start = await append_audit_log(
        db,
        event_type=f"{event}.start",
        entity_type=entity,
        entity_id=entity_id,
        org_id=org_id,
        actor=actor,
        payload=payload,
    )
    await append_audit_log(
        db,
        event_type=f"{event}.complete",
        entity_type=entity,
        entity_id=entity_id,
        org_id=org_id,
        actor=actor,
        prev_hash_override=start,
        payload=payload,
    )


async def _assignment_out(
    db: AsyncSession,
    assignment_id: str,
    *,
    include_targets: bool = True,
) -> Assignment:
    row = (
        await db.execute(
            text(
                """
                SELECT a.*,
                  COALESCE(array_agg(DISTINCT ap.scenario_slug)
                    FILTER (WHERE ap.scenario_slug IS NOT NULL), '{}') AS practices,
                  COALESCE(array_agg(DISTINCT al.learner_id)
                    FILTER (WHERE al.learner_id IS NOT NULL), '{}') AS learner_ids,
                  count(DISTINCT al.id)::int AS learner_count,
                  count(DISTINCT al.id) FILTER (WHERE al.status = 'completed')::int
                    AS completed_count
                FROM assignments a
                LEFT JOIN assignment_practices ap
                  ON ap.org_id = a.org_id AND ap.assignment_id = a.id
                LEFT JOIN assignment_learners al
                  ON al.org_id = a.org_id AND al.assignment_id = a.id
                WHERE a.id = CAST(:id AS uuid)
                GROUP BY a.id
                """
            ),
            {"id": assignment_id},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return Assignment(
        **governed(
            id=str(row["id"]),
            org_id=str(row["org_id"]),
            cohort_id=str(row["cohort_id"]) if row["cohort_id"] else None,
            title=str(row["title"]),
            instructions=str(row["instructions"]),
            due_at=iso(row["due_at"]),
            status=str(row["status"]),
            practices=[str(value) for value in row["practices"]],
            learner_ids=(
                [str(value) for value in row["learner_ids"]]
                if include_targets
                else []
            ),
            learner_count=int(row["learner_count"]) if include_targets else 1,
            completed_count=int(row["completed_count"]),
        )
    )


@router.get("/cohorts", response_model=list[Cohort])
async def get_cohorts(
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.coach_learners)),
    db: AsyncSession = Depends(get_db),
) -> list[Cohort]:
    effective = await bind_scoped_org(db, user, _org(user, org_id))
    return await list_cohorts(db, effective)


@router.post("/cohorts", response_model=Cohort, status_code=201)
@limiter.limit("20/minute", key_func=authenticated_rate_limit_key)
async def create_cohort(
    request: Request,
    body: CohortInput,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.coach_learners)),
    db: AsyncSession = Depends(get_db),
) -> Cohort:
    effective = await bind_writable_org(db, user, _org(user, org_id))
    row = (
        await db.execute(
            text(
                """
                INSERT INTO cohorts (org_id, name, description, created_by)
                VALUES (:org_id, :name, :description, :actor)
                RETURNING *
                """
            ),
            {
                "org_id": effective,
                "name": body.name.strip(),
                "description": body.description.strip(),
                "actor": _actor(user),
            },
        )
    ).mappings().one()
    await _audit_pair(
        db,
        event="instruction.cohort.create",
        entity="cohort",
        entity_id=str(row["id"]),
        org_id=effective,
        actor=_actor(user),
        payload={"name": body.name.strip()},
    )
    return Cohort(
        **governed(
            id=str(row["id"]),
            org_id=effective,
            name=str(row["name"]),
            description=str(row["description"]),
            status=str(row["status"]),
            learner_count=0,
            created_at=iso(row["created_at"]),
        )
    )


@router.patch("/cohorts/{cohort_id}", response_model=Cohort)
@limiter.limit("30/minute", key_func=authenticated_rate_limit_key)
async def update_cohort(
    request: Request,
    cohort_id: str,
    body: CohortPatch,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.coach_learners)),
    db: AsyncSession = Depends(get_db),
) -> Cohort:
    effective = await bind_writable_org(db, user, _org(user, org_id))
    values = body.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="No cohort changes supplied")
    row = (
        await db.execute(
            text(
                """
                UPDATE cohorts SET
                  name = COALESCE(:name, name),
                  description = COALESCE(:description, description),
                  status = COALESCE(:status, status), updated_at = NOW()
                WHERE id = CAST(:id AS uuid) AND org_id = :org_id
                RETURNING *
                """
            ),
            {"id": cohort_id, "org_id": effective, **values},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Cohort not found")
    await _audit_pair(
        db,
        event="instruction.cohort.update",
        entity="cohort",
        entity_id=cohort_id,
        org_id=effective,
        actor=_actor(user),
        payload={"fields": sorted(values)},
    )
    cohorts = await list_cohorts(db, effective)
    return next(item for item in cohorts if item.id == cohort_id)


@router.delete("/cohorts/{cohort_id}", status_code=204)
@limiter.limit("10/minute", key_func=authenticated_rate_limit_key)
async def delete_cohort(
    request: Request,
    cohort_id: str,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.coach_learners)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    effective = await bind_writable_org(db, user, _org(user, org_id))
    result = await db.execute(
        text(
            """
            UPDATE cohorts SET status = 'archived', updated_at = NOW()
            WHERE id = CAST(:id AS uuid) AND org_id = :org_id
            """
        ),
        {"id": cohort_id, "org_id": effective},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Cohort not found")
    await _audit_pair(
        db,
        event="instruction.cohort.delete",
        entity="cohort",
        entity_id=cohort_id,
        org_id=effective,
        actor=_actor(user),
        payload={},
    )
    return Response(status_code=204)


@router.put("/cohorts/{cohort_id}/members")
@limiter.limit("20/minute", key_func=authenticated_rate_limit_key)
async def replace_members(
    request: Request,
    cohort_id: str,
    body: MembershipInput,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.coach_learners)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int | str]:
    effective = await bind_writable_org(db, user, _org(user, org_id))
    exists = (
        await db.execute(
            text("SELECT 1 FROM cohorts WHERE id = CAST(:id AS uuid) AND org_id = :org_id"),
            {"id": cohort_id, "org_id": effective},
        )
    ).scalar()
    if not exists:
        raise HTTPException(status_code=404, detail="Cohort not found")
    learner_ids = sorted({value.strip() for value in body.learner_ids if value.strip()})
    await _validate_learners(db, effective, learner_ids)
    await db.execute(
        text("DELETE FROM cohort_memberships WHERE cohort_id = CAST(:id AS uuid)"),
        {"id": cohort_id},
    )
    for learner_id in learner_ids:
        await db.execute(
            text(
                """
                INSERT INTO cohort_memberships (org_id, cohort_id, learner_id)
                VALUES (:org_id, CAST(:cohort_id AS uuid), :learner_id)
                """
            ),
            {"org_id": effective, "cohort_id": cohort_id, "learner_id": learner_id},
        )
    await _audit_pair(
        db,
        event="instruction.cohort.members.replace",
        entity="cohort",
        entity_id=cohort_id,
        org_id=effective,
        actor=_actor(user),
        payload={"learner_count": len(learner_ids)},
    )
    return {"status": "ok", "learner_count": len(learner_ids)}


@router.get("/assignments", response_model=list[Assignment])
async def get_assignments(
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Assignment]:
    effective = await bind_scoped_org(db, user, _org(user, org_id))
    actor = _actor(user)
    elevated = user_has_permission(user, Permission.coach_learners)
    ids = (
        await db.execute(
            text(
                """
                SELECT DISTINCT a.id
                FROM assignments a
                LEFT JOIN assignment_learners al
                  ON al.org_id = a.org_id AND al.assignment_id = a.id
                WHERE a.org_id = :org_id
                  AND (:elevated OR (al.learner_id = :actor AND a.status = 'published'))
                ORDER BY a.id
                """
            ),
            {"org_id": effective, "elevated": elevated, "actor": actor},
        )
    ).scalars().all()
    return [
        await _assignment_out(db, str(item), include_targets=elevated)
        for item in ids
    ]


@router.get("/assignments/{assignment_id}", response_model=Assignment)
async def get_assignment(
    assignment_id: str,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Assignment:
    effective = await bind_scoped_org(db, user, _org(user, org_id))
    elevated = user_has_permission(user, Permission.coach_learners)
    allowed = (
        await db.execute(
            text(
                """
                SELECT 1 FROM assignments a
                LEFT JOIN assignment_learners al
                  ON al.org_id = a.org_id AND al.assignment_id = a.id
                WHERE a.id = CAST(:id AS uuid) AND a.org_id = :org_id
                  AND (:elevated OR (a.status = 'published' AND al.learner_id = :actor))
                """
            ),
            {
                "id": assignment_id,
                "org_id": effective,
                "elevated": elevated,
                "actor": _actor(user),
            },
        )
    ).scalar()
    if not allowed:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return await _assignment_out(db, assignment_id, include_targets=elevated)


@router.post("/assignments", response_model=Assignment, status_code=201)
@limiter.limit("20/minute", key_func=authenticated_rate_limit_key)
async def create_assignment(
    request: Request,
    body: AssignmentInput,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.manage_curriculum)),
    db: AsyncSession = Depends(get_db),
) -> Assignment:
    effective = await bind_writable_org(db, user, _org(user, org_id))
    row = (
        await db.execute(
            text(
                """
                INSERT INTO assignments (
                  org_id, cohort_id, title, instructions, due_at, status, created_by
                ) VALUES (
                  :org_id, CAST(:cohort_id AS uuid), :title, :instructions,
                  CAST(:due_at AS timestamptz), :status, :actor
                ) RETURNING id
                """
            ),
            {
                "org_id": effective,
                "cohort_id": body.cohort_id,
                "title": body.title.strip(),
                "instructions": body.instructions.strip(),
                "due_at": body.due_at,
                "status": body.status,
                "actor": _actor(user),
            },
        )
    ).mappings().one()
    assignment_id = str(row["id"])
    await _replace_assignment_targets(db, effective, assignment_id, body.practices, body.learner_ids, body.cohort_id)
    await _audit_pair(
        db,
        event="instruction.assignment.create",
        entity="assignment",
        entity_id=assignment_id,
        org_id=effective,
        actor=_actor(user),
        payload={"status": body.status, "due_at": body.due_at},
    )
    return await _assignment_out(db, assignment_id)


async def _replace_assignment_targets(
    db: AsyncSession,
    org_id: str,
    assignment_id: str,
    practices: list[str] | None,
    learner_ids: list[str] | None,
    cohort_id: str | None = None,
) -> None:
    if practices is not None:
        await db.execute(
            text("DELETE FROM assignment_practices WHERE assignment_id = CAST(:id AS uuid)"),
            {"id": assignment_id},
        )
        for position, slug in enumerate(dict.fromkeys(practices), start=1):
            await db.execute(
                text(
                    """
                    INSERT INTO assignment_practices
                      (org_id, assignment_id, scenario_slug, position)
                    VALUES (:org_id, CAST(:id AS uuid), :slug, :position)
                    """
                ),
                {"org_id": org_id, "id": assignment_id, "slug": slug, "position": position},
            )
    if learner_ids is not None:
        targets = {value.strip() for value in learner_ids if value.strip()}
        if cohort_id:
            cohort_targets = (
                await db.execute(
                    text(
                        "SELECT learner_id FROM cohort_memberships WHERE cohort_id = CAST(:id AS uuid)"
                    ),
                    {"id": cohort_id},
                )
            ).scalars().all()
            targets.update(str(value) for value in cohort_targets)
        await _validate_learners(db, org_id, sorted(targets))
        await db.execute(
            text("DELETE FROM assignment_learners WHERE assignment_id = CAST(:id AS uuid)"),
            {"id": assignment_id},
        )
        for learner_id in sorted(targets):
            await db.execute(
                text(
                    """
                    INSERT INTO assignment_learners (org_id, assignment_id, learner_id)
                    VALUES (:org_id, CAST(:id AS uuid), :learner_id)
                    """
                ),
                {"org_id": org_id, "id": assignment_id, "learner_id": learner_id},
            )


async def _validate_learners(
    db: AsyncSession,
    org_id: str,
    learner_ids: list[str],
) -> None:
    if not learner_ids:
        return
    valid = set(
        str(value)
        for value in (
            await db.execute(
                text(
                    """
                    SELECT id FROM users
                    WHERE org_id = :org_id AND is_active
                      AND id = ANY(CAST(:learner_ids AS text[]))
                    """
                ),
                {"org_id": org_id, "learner_ids": learner_ids},
            )
        ).scalars().all()
    )
    invalid = sorted(set(learner_ids) - valid)
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Learners are not active members of this tenant: {invalid}",
        )


@router.patch("/assignments/{assignment_id}", response_model=Assignment)
@limiter.limit("30/minute", key_func=authenticated_rate_limit_key)
async def update_assignment(
    request: Request,
    assignment_id: str,
    body: AssignmentPatch,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.manage_curriculum)),
    db: AsyncSession = Depends(get_db),
) -> Assignment:
    effective = await bind_writable_org(db, user, _org(user, org_id))
    values = body.model_dump(exclude_unset=True)
    result = await db.execute(
        text(
            """
            UPDATE assignments SET
              title = COALESCE(:title, title),
              instructions = COALESCE(:instructions, instructions),
              due_at = CASE WHEN :due_supplied THEN CAST(:due_at AS timestamptz) ELSE due_at END,
              status = COALESCE(:status, status), updated_at = NOW()
            WHERE id = CAST(:id AS uuid) AND org_id = :org_id
            RETURNING cohort_id
            """
        ),
        {
            "id": assignment_id,
            "org_id": effective,
            "title": values.get("title"),
            "instructions": values.get("instructions"),
            "due_at": values.get("due_at"),
            "due_supplied": "due_at" in values,
            "status": values.get("status"),
        },
    )
    cohort_id = result.scalar_one_or_none()
    if cohort_id is None and not (
        await db.execute(
            text("SELECT 1 FROM assignments WHERE id = CAST(:id AS uuid)"),
            {"id": assignment_id},
        )
    ).scalar():
        raise HTTPException(status_code=404, detail="Assignment not found")
    await _replace_assignment_targets(
        db,
        effective,
        assignment_id,
        values.get("practices") if "practices" in values else None,
        values.get("learner_ids") if "learner_ids" in values else None,
        str(cohort_id) if cohort_id else None,
    )
    await _audit_pair(
        db,
        event="instruction.assignment.update",
        entity="assignment",
        entity_id=assignment_id,
        org_id=effective,
        actor=_actor(user),
        payload={"fields": sorted(values)},
    )
    return await _assignment_out(db, assignment_id)


@router.delete("/assignments/{assignment_id}", status_code=204)
@limiter.limit("10/minute", key_func=authenticated_rate_limit_key)
async def delete_assignment(
    request: Request,
    assignment_id: str,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.manage_curriculum)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    effective = await bind_writable_org(db, user, _org(user, org_id))
    result = await db.execute(
        text(
            """
            UPDATE assignments SET status = 'archived', updated_at = NOW()
            WHERE id = CAST(:id AS uuid) AND org_id = :org_id
            """
        ),
        {"id": assignment_id, "org_id": effective},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await _audit_pair(
        db,
        event="instruction.assignment.delete",
        entity="assignment",
        entity_id=assignment_id,
        org_id=effective,
        actor=_actor(user),
        payload={},
    )
    return Response(status_code=204)


@router.post("/assignments/{assignment_id}/status")
@limiter.limit("30/minute", key_func=authenticated_rate_limit_key)
async def update_my_assignment_status(
    request: Request,
    assignment_id: str,
    body: AssignmentStatusInput,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    effective = await bind_writable_org(db, user, _org(user, org_id))
    actor = _actor(user)
    if body.status == "completed":
        incomplete = (
            await db.execute(
                text(
                    """
                    SELECT count(*)
                    FROM assignment_practices ap
                    WHERE ap.assignment_id = CAST(:id AS uuid)
                      AND NOT EXISTS (
                        SELECT 1 FROM scenario_sessions ss
                        WHERE ss.org_id = :org_id AND ss.learner_id = :learner_id
                          AND ss.scenario = ap.scenario_slug AND ss.stage = 'complete'
                      )
                    """
                ),
                {"id": assignment_id, "org_id": effective, "learner_id": actor},
            )
        ).scalar_one()
        if int(incomplete) > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Complete every assigned practice before completing the assignment",
            )
    result = await db.execute(
        text(
            """
            UPDATE assignment_learners SET
              status = :status,
              completed_at = CASE WHEN :status = 'completed' THEN NOW() ELSE NULL END
            WHERE assignment_id = CAST(:id AS uuid)
              AND org_id = :org_id AND learner_id = :learner_id
            """
        ),
        {
            "id": assignment_id,
            "org_id": effective,
            "learner_id": actor,
            "status": body.status,
        },
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await _audit_pair(
        db,
        event="instruction.assignment.status",
        entity="assignment",
        entity_id=assignment_id,
        org_id=effective,
        actor=actor,
        payload={"status": body.status},
    )
    return {"status": body.status}


@router.get("/progress", response_model=list[LearnerProgress])
async def get_progress(
    org_id: str | None = Query(None),
    cohort_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.coach_learners)),
    db: AsyncSession = Depends(get_db),
) -> list[LearnerProgress]:
    effective = await bind_scoped_org(db, user, _org(user, org_id))
    return await assignment_progress(db, effective, cohort_id=cohort_id)


@router.post("/briefing", response_model=CohortBriefing)
@limiter.limit("10/minute", key_func=authenticated_rate_limit_key)
async def create_briefing(
    request: Request,
    body: BriefingInput,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.coach_learners)),
    db: AsyncSession = Depends(get_db),
) -> CohortBriefing:
    """Draft a cohort briefing. The model cannot create an assignment."""
    effective = await bind_writable_org(db, user, _org(user, org_id))
    actor = _actor(user)
    cohort_id = (body.cohort_id or "").strip() or None
    if cohort_id is not None:
        try:
            uuid.UUID(cohort_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Cohort id must be a UUID") from exc
        found = (
            await db.execute(
                text(
                    """
                    SELECT id FROM cohorts
                    WHERE id = CAST(:id AS uuid) AND org_id = :org_id
                    """
                ),
                {"id": cohort_id, "org_id": effective},
            )
        ).first()
        if found is None:
            raise HTTPException(status_code=404, detail="Cohort not found")
    progress = await assignment_progress(db, effective, cohort_id=cohort_id)
    if cohort_id is not None:
        suggested_statement = text(
            """
            SELECT ap.scenario_slug
            FROM assignment_practices ap
            JOIN assignments a
              ON a.org_id = ap.org_id AND a.id = ap.assignment_id
            JOIN assignment_learners al
              ON al.org_id = a.org_id AND al.assignment_id = a.id
            WHERE a.org_id = :org_id
              AND a.cohort_id = CAST(:cohort_id AS uuid)
              AND al.status NOT IN ('completed', 'excused')
            GROUP BY ap.scenario_slug
            ORDER BY count(*) DESC, ap.scenario_slug
            LIMIT 1
            """
        )
        suggested_params: dict[str, Any] = {"org_id": effective, "cohort_id": cohort_id}
    else:
        suggested_statement = text(
            """
            SELECT ap.scenario_slug
            FROM assignment_practices ap
            JOIN assignments a
              ON a.org_id = ap.org_id AND a.id = ap.assignment_id
            JOIN assignment_learners al
              ON al.org_id = a.org_id AND al.assignment_id = a.id
            WHERE a.org_id = :org_id
              AND al.status NOT IN ('completed', 'excused')
            GROUP BY ap.scenario_slug
            ORDER BY count(*) DESC, ap.scenario_slug
            LIMIT 1
            """
        )
        suggested_params = {"org_id": effective}
    suggested = (await db.execute(suggested_statement, suggested_params)).scalar_one_or_none()
    suggested_practice_id = str(suggested) if suggested else None
    rows = [item.model_dump() for item in progress]
    facts = briefing_facts(rows, suggested_practice_id)
    stuck = ", ".join(facts["stuck_learners"]) or "none"
    narration = await narrate(
        kind="briefing",
        facts=facts,
        fallback=(
            f"{facts['learner_count']} learners, {facts['overdue_count']} overdue, "
            f"{facts['completed_count']} completed. Stuck: {stuck}. "
            f"Suggested practice: {suggested_practice_id or 'none'}."
        ),
        required_practice_id=suggested_practice_id,
    )
    await _audit_pair(
        db,
        event="instruction.briefing",
        entity="cohort",
        entity_id=cohort_id,
        org_id=effective,
        actor=actor,
        payload={
            "source": narration.source,
            "suggested_practice_id": suggested_practice_id,
            "requires_human_review": narration.requires_human_review,
        },
    )
    await audit_invoked_narration(
        db,
        kind="briefing",
        entity_type="cohort",
        entity_id=cohort_id,
        org_id=effective,
        actor=actor,
        narration=narration,
    )
    return CohortBriefing(
        jurisdiction="internal",
        purpose_tags=["learning", "instruction", "narration"],
        cohort_id=cohort_id,
        narrative=narration.narrative,
        cited_facts=narration.cited_facts,
        confidence=narration.confidence,
        source=narration.source,
        requires_human_review=narration.requires_human_review,
        suggested_practice_id=suggested_practice_id,
        provider=narration.provider,
        model=narration.model,
    )


@router.post("/learners/{learner_id}/notes", response_model=CoachingNote, status_code=201)
@limiter.limit("30/minute", key_func=authenticated_rate_limit_key)
async def create_note(
    request: Request,
    learner_id: str,
    body: NoteInput,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.coach_learners)),
    db: AsyncSession = Depends(get_db),
) -> CoachingNote:
    effective = await bind_writable_org(db, user, _org(user, org_id))
    actor = _actor(user)
    await _validate_learners(db, effective, [learner_id])
    start = await append_audit_log(
        db,
        event_type="instruction.coaching_note.create.start",
        entity_type="coaching_note",
        entity_id=None,
        org_id=effective,
        actor=actor,
        payload={"learner_id": learner_id, "visibility": body.visibility},
    )
    row = (
        await db.execute(
            text(
                """
                INSERT INTO coaching_notes (
                  org_id, learner_id, cohort_id, assignment_id,
                  author_id, body, visibility
                ) VALUES (
                  :org_id, :learner_id, CAST(:cohort_id AS uuid),
                  CAST(:assignment_id AS uuid), :author_id, :body, :visibility
                ) RETURNING *
                """
            ),
            {
                "org_id": effective,
                "learner_id": learner_id,
                "cohort_id": body.cohort_id,
                "assignment_id": body.assignment_id,
                "author_id": actor,
                "body": body.body.strip(),
                "visibility": body.visibility,
            },
        )
    ).mappings().one()
    await append_audit_log(
        db,
        event_type="instruction.coaching_note.create.complete",
        entity_type="coaching_note",
        entity_id=str(row["id"]),
        org_id=effective,
        actor=actor,
        prev_hash_override=start,
        payload={"learner_id": learner_id, "visibility": body.visibility},
    )
    return _note_out(row)


def _note_out(row: Any) -> CoachingNote:
    return CoachingNote(
        **governed(
            id=str(row["id"]),
            learner_id=str(row["learner_id"]),
            author_id=str(row["author_id"]),
            body=str(row["body"]),
            visibility=str(row["visibility"]),
            cohort_id=str(row["cohort_id"]) if row["cohort_id"] else None,
            assignment_id=str(row["assignment_id"]) if row["assignment_id"] else None,
            created_at=str(iso(row["created_at"])),
        )
    )


@router.get("/learners/{learner_id}/notes", response_model=list[CoachingNote])
async def get_notes(
    learner_id: str,
    org_id: str | None = Query(None),
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CoachingNote]:
    effective = await bind_scoped_org(db, user, _org(user, org_id))
    actor = _actor(user)
    elevated = user_has_permission(user, Permission.coach_learners)
    if not elevated and learner_id != actor:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Learners may only read their own notes")
    rows = (
        await db.execute(
            text(
                """
                SELECT * FROM coaching_notes
                WHERE org_id = :org_id AND learner_id = :learner_id
                  AND (:elevated OR visibility = 'learner_visible')
                ORDER BY created_at DESC
                """
            ),
            {
                "org_id": effective,
                "learner_id": learner_id,
                "elevated": elevated,
            },
        )
    ).mappings().all()
    return [_note_out(row) for row in rows]


@router.get("/export")
@limiter.limit("10/minute", key_func=authenticated_rate_limit_key)
async def export_progress(
    request: Request,
    format: Literal["json", "csv"] = Query("json"),
    org_id: str | None = Query(None),
    cohort_id: str | None = Query(None),
    user: dict[str, Any] = Depends(require_permission(Permission.coach_learners)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    effective = await bind_scoped_org(db, user, _org(user, org_id))
    rows = await assignment_progress(db, effective, cohort_id=cohort_id)
    payload = [row.model_dump(mode="json") for row in rows]
    await _audit_pair(
        db,
        event="instruction.progress.export",
        entity="cohort" if cohort_id else "organisation",
        entity_id=cohort_id or effective,
        org_id=effective,
        actor=_actor(user),
        payload={"format": format, "row_count": len(payload)},
    )
    if format == "json":
        return Response(
            content=json.dumps(payload),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="learner-progress.json"'},
        )
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=["learner_id", "display_name", "assigned", "completed", "overdue", "last_active_at"],
        extrasaction="ignore",
    )
    writer.writeheader()
    writer.writerows(payload)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="learner-progress.csv"'},
    )
