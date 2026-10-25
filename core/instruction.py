"""Tenant-bound instruction domain models and query services."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.governance import SovereignModel


class Cohort(SovereignModel):
    id: str
    org_id: str
    name: str
    description: str = ""
    status: str
    learner_count: int = 0
    created_at: str | None = None


class Assignment(SovereignModel):
    id: str
    org_id: str
    cohort_id: str | None = None
    title: str
    instructions: str = ""
    due_at: str | None = None
    status: str
    practices: list[str] = Field(default_factory=list)
    learner_ids: list[str] = Field(default_factory=list)
    completed_count: int = 0
    learner_count: int = 0


class LearnerProgress(SovereignModel):
    learner_id: str
    display_name: str = ""
    assigned: int = 0
    completed: int = 0
    overdue: int = 0
    last_active_at: str | None = None


class CoachingNote(SovereignModel):
    id: str
    learner_id: str
    author_id: str
    body: str
    visibility: str
    cohort_id: str | None = None
    assignment_id: str | None = None
    created_at: str


def iso(value: Any) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else (str(value) if value else None)


def governed(**values: Any) -> dict[str, Any]:
    return {
        "jurisdiction": "internal",
        "purpose_tags": ["learning", "instruction"],
        **values,
    }


async def list_cohorts(db: AsyncSession, org_id: str) -> list[Cohort]:
    rows = (
        await db.execute(
            text(
                """
                SELECT c.*, count(cm.id)::int AS learner_count
                FROM cohorts c
                LEFT JOIN cohort_memberships cm
                  ON cm.org_id = c.org_id AND cm.cohort_id = c.id
                WHERE c.org_id = :org_id
                GROUP BY c.id
                ORDER BY c.updated_at DESC
                """
            ),
            {"org_id": org_id},
        )
    ).mappings().all()
    return [
        Cohort(
            **governed(
                id=str(row["id"]),
                org_id=str(row["org_id"]),
                name=str(row["name"]),
                description=str(row["description"]),
                status=str(row["status"]),
                learner_count=int(row["learner_count"]),
                created_at=iso(row["created_at"]),
            )
        )
        for row in rows
    ]


async def assignment_progress(
    db: AsyncSession,
    org_id: str,
    *,
    cohort_id: str | None = None,
) -> list[LearnerProgress]:
    cohort_filter = ""
    params: dict[str, Any] = {"org_id": org_id}
    if cohort_id:
        # asyncpg cannot infer a NULL uuid parameter, so the filter is omitted
        # when the caller wants every cohort in the tenant.
        cohort_filter = "AND a.cohort_id = CAST(:cohort_id AS uuid)"
        params["cohort_id"] = cohort_id
    rows = (
        await db.execute(
            text(
                f"""
                SELECT al.learner_id, COALESCE(u.email, al.learner_id) AS display_name,
                       count(DISTINCT al.id)::int AS assigned,
                       count(DISTINCT al.id) FILTER (WHERE al.status = 'completed')::int AS completed,
                       count(DISTINCT al.id) FILTER (
                         WHERE a.status = 'published' AND a.due_at < NOW()
                           AND al.status NOT IN ('completed', 'excused')
                       )::int AS overdue,
                       max(ss.updated_at) AS last_active_at
                FROM assignment_learners al
                JOIN assignments a ON a.org_id = al.org_id AND a.id = al.assignment_id
                LEFT JOIN users u ON u.id::text = al.learner_id
                LEFT JOIN scenario_sessions ss
                  ON ss.org_id = al.org_id AND ss.learner_id = al.learner_id
                WHERE al.org_id = :org_id
                  {cohort_filter}
                GROUP BY al.learner_id, u.email
                ORDER BY overdue DESC, display_name
                """
            ),
            params,
        )
    ).mappings().all()
    return [
        LearnerProgress(
            **governed(
                learner_id=str(row["learner_id"]),
                display_name=str(row["display_name"]),
                assigned=int(row["assigned"]),
                completed=int(row["completed"]),
                overdue=int(row["overdue"]),
                last_active_at=iso(row["last_active_at"]),
            )
        )
        for row in rows
    ]


def is_overdue(due_at: datetime | None, status: str) -> bool:
    """Pure status helper used by exports and tests."""
    if due_at is None or status in {"completed", "excused"}:
        return False
    reference = due_at if due_at.tzinfo else due_at.replace(tzinfo=timezone.utc)
    return reference < datetime.now(timezone.utc)
