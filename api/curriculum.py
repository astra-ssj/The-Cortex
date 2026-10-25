"""Published curriculum discovery and the caller's deterministic learning plan."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from core.audit_fabric import append_audit_log
from core.competency import rollup_dimensions
from core.governance import SovereignModel
from core.rbac import Permission, require_permission
from core.scenario_draft import draft_customer_scenario
from core.learning_recommendations import (
    CompetencySignal,
    LearningRecommendation,
    RecommendationCandidate,
    rank_practices,
)
from core.security import get_current_user
from core.tenant import bind_scoped_org, bind_writable_org

router = APIRouter(prefix="/api/v1/curriculum", tags=["curriculum"])


class PublishedPractice(SovereignModel):
    practice_id: str
    practice_version_id: str
    version: str
    title: str
    summary: str
    frameworks: list[str] = Field(default_factory=list)
    difficulty: str
    scenario_slug: str | None
    content_hash: str
    target_dimensions: list[str] = Field(default_factory=list)
    prerequisite_track_version_ids: list[str] = Field(default_factory=list)
    completed: bool = False
    locked: bool = False
    recommended: bool = False


class PublishedTrack(SovereignModel):
    track_id: str
    track_version_id: str
    version: int
    title: str
    content_hash: str
    prerequisite_track_version_ids: list[str] = Field(default_factory=list)
    completed: bool = False
    locked: bool = False
    recommended: bool = False


class LearningPlan(SovereignModel):
    learner_id: str
    recommended_track_version_id: str | None
    recommended_practice_version_id: str | None
    recommendation: LearningRecommendation | None = None
    tracks: list[PublishedTrack] = Field(default_factory=list)
    practices: list[PublishedPractice] = Field(default_factory=list)


def _learner(current_user: dict[str, Any]) -> str:
    return str(current_user.get("sub") or current_user.get("email") or "anonymous")


async def _context(
    db: AsyncSession, current_user: dict[str, Any]
) -> tuple[str, str, str | None, str | None, str | None, str, float | None]:
    org_id = str(current_user.get("org_id") or "")
    effective = await bind_scoped_org(db, current_user, org_id)
    learner_id = _learner(current_user)
    recommendation = (
        await db.execute(
            text(
                """
                SELECT dr.track_version_id::text, dr.recommended_practice_version_id::text,
                       recommended_pv.practice_id AS recommended_practice_id,
                       dr.confidence, da.experience_level
                FROM diagnostic_recommendations dr
                JOIN diagnostic_attempts da ON da.id = dr.attempt_id
                LEFT JOIN practice_versions recommended_pv
                  ON recommended_pv.id = dr.recommended_practice_version_id
                WHERE da.learner_id = :learner_id
                ORDER BY dr.created_at DESC LIMIT 1
                """
            ),
            {"learner_id": learner_id},
        )
    ).mappings().one_or_none()
    return (
        effective,
        learner_id,
        str(recommendation["track_version_id"]) if recommendation and recommendation["track_version_id"] else None,
        (
            str(recommendation["recommended_practice_version_id"])
            if recommendation and recommendation["recommended_practice_version_id"]
            else None
        ),
        (
            str(recommendation["recommended_practice_id"])
            if recommendation and recommendation["recommended_practice_id"]
            else None
        ),
        str(recommendation["experience_level"]) if recommendation else "new",
        float(recommendation["confidence"]) if recommendation else None,
    )


async def _practices(
    db: AsyncSession, learner_id: str, recommended_id: str | None
) -> list[PublishedPractice]:
    rows = (
        await db.execute(
            text(
                """
                SELECT pv.practice_id, pv.id::text AS practice_version_id, pv.version,
                       pv.title, pv.summary, pv.content_hash,
                       COALESCE(pv.content->'target_dimensions', '[]'::jsonb) AS target_dimensions,
                       sv.frameworks, sv.difficulty, sv.slug AS scenario_slug,
                       ARRAY(
                         SELECT DISTINCT tp.prerequisite_track_version_id::text
                         FROM track_memberships tm
                         JOIN track_prerequisites tp ON tp.track_version_id = tm.track_version_id
                         WHERE tm.scenario_version_id = sv.id
                       ) AS prerequisites,
                       EXISTS (
                         SELECT 1 FROM curriculum_completions cc
                         WHERE cc.learner_id = :learner_id
                           AND cc.scenario_version_id = sv.id
                       ) AS completed,
                       EXISTS (
                         SELECT 1
                         FROM track_memberships tm
                         JOIN track_prerequisites tp ON tp.track_version_id = tm.track_version_id
                         WHERE tm.scenario_version_id = sv.id
                           AND NOT EXISTS (
                             SELECT 1 FROM curriculum_enrollments ce
                             WHERE ce.learner_id = :learner_id
                               AND ce.track_version_id = tp.prerequisite_track_version_id
                               AND ce.status = 'completed'
                           )
                       ) AS locked
                FROM practice_versions pv
                LEFT JOIN LATERAL (
                  SELECT id, frameworks, difficulty, slug
                  FROM scenario_versions
                  WHERE practice_version_id = pv.id AND status = 'published'
                  ORDER BY version DESC LIMIT 1
                ) sv ON TRUE
                WHERE pv.status = 'published'
                  AND pv.id = (
                    SELECT newest.id
                    FROM practice_versions newest
                    WHERE newest.practice_id = pv.practice_id
                      AND newest.status = 'published'
                    ORDER BY newest.published_at DESC NULLS LAST,
                             newest.created_at DESC, newest.version DESC
                    LIMIT 1
                  )
                ORDER BY pv.title, pv.version DESC
                """
            ),
            {"learner_id": learner_id},
        )
    ).mappings().all()
    return [
        PublishedPractice(
            jurisdiction="internal",
            purpose_tags=["learning", "curriculum-discovery"],
            practice_id=str(row["practice_id"]),
            practice_version_id=str(row["practice_version_id"]),
            version=str(row["version"]),
            title=str(row["title"]),
            summary=str(row["summary"]),
            frameworks=[str(value) for value in (row["frameworks"] or [])],
            difficulty=str(row["difficulty"] or "foundation"),
            scenario_slug=str(row["scenario_slug"]) if row["scenario_slug"] else None,
            content_hash=str(row["content_hash"]),
            target_dimensions=[
                str(value) for value in (row["target_dimensions"] or [])
            ],
            prerequisite_track_version_ids=[
                str(value) for value in (row["prerequisites"] or [])
            ],
            completed=bool(row["completed"]),
            locked=bool(row["locked"]),
            recommended=str(row["practice_version_id"]) == recommended_id,
        )
        for row in rows
    ]


async def _tracks(
    db: AsyncSession, learner_id: str, recommended_id: str | None
) -> list[PublishedTrack]:
    rows = (
        await db.execute(
            text(
                """
                SELECT tv.track_id, tv.id::text AS track_version_id, tv.version, tv.title,
                       tv.content_hash,
                       ARRAY(
                         SELECT tp.prerequisite_track_version_id::text
                         FROM track_prerequisites tp WHERE tp.track_version_id = tv.id
                         ORDER BY tp.prerequisite_track_version_id
                       ) AS prerequisites,
                       EXISTS (
                         SELECT 1 FROM curriculum_enrollments ce
                         WHERE ce.learner_id = :learner_id
                           AND ce.track_version_id = tv.id AND ce.status = 'completed'
                       ) AS completed,
                       NOT EXISTS (
                         SELECT 1 FROM track_prerequisites tp
                         WHERE tp.track_version_id = tv.id
                           AND NOT EXISTS (
                             SELECT 1 FROM curriculum_enrollments ce
                             WHERE ce.learner_id = :learner_id
                               AND ce.track_version_id = tp.prerequisite_track_version_id
                               AND ce.status = 'completed'
                           )
                       ) AS prerequisites_complete
                FROM track_versions tv
                WHERE tv.status = 'published'
                  AND tv.id = (
                    SELECT newest.id
                    FROM track_versions newest
                    WHERE newest.track_id = tv.track_id
                      AND newest.status = 'published'
                    ORDER BY newest.published_at DESC NULLS LAST,
                             newest.created_at DESC, newest.version DESC
                    LIMIT 1
                  )
                ORDER BY tv.title, tv.version DESC
                """
            ),
            {"learner_id": learner_id},
        )
    ).mappings().all()
    return [
        PublishedTrack(
            jurisdiction="internal",
            purpose_tags=["learning", "curriculum-discovery"],
            track_id=str(row["track_id"]),
            track_version_id=str(row["track_version_id"]),
            version=int(row["version"]),
            title=str(row["title"]),
            content_hash=str(row["content_hash"]),
            prerequisite_track_version_ids=[str(value) for value in (row["prerequisites"] or [])],
            completed=bool(row["completed"]),
            locked=not bool(row["prerequisites_complete"]),
            recommended=str(row["track_version_id"]) == recommended_id,
        )
        for row in rows
    ]


@router.get("/practices", response_model=list[PublishedPractice])
async def list_published_practices(
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PublishedPractice]:
    _, learner_id, _, practice_id, _, _, _ = await _context(db, current_user)
    return await _practices(db, learner_id, practice_id)


@router.get("/tracks", response_model=list[PublishedTrack])
async def list_published_tracks(
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PublishedTrack]:
    _, learner_id, track_id, _, _, _, _ = await _context(db, current_user)
    return await _tracks(db, learner_id, track_id)


@router.get("/me/learning-plan", response_model=LearningPlan)
async def get_learning_plan(
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LearningPlan:
    (
        _,
        learner_id,
        track_id,
        practice_id,
        diagnostic_practice_id,
        experience_level,
        diagnostic_confidence,
    ) = await _context(db, current_user)
    practices = await _practices(db, learner_id, practice_id)
    session_rows = (
        await db.execute(
            text(
                """
                SELECT scenario, competency
                FROM scenario_sessions
                WHERE learner_id = :learner_id
                ORDER BY updated_at, id
                """
            ),
            {"learner_id": learner_id},
        )
    ).mappings().all()
    signals = [
        CompetencySignal(
            jurisdiction="internal",
            purpose_tags=["learning", "competency"],
            dimension=item.dimension,
            score=item.score,
            proven=item.proven,
        )
        for item in rollup_dimensions([dict(row) for row in session_rows])
    ]
    fallback = {
        "new": "foundation",
        "developing": "practitioner",
        "experienced": "expert",
    }.get(experience_level, "foundation")
    recommendation = rank_practices(
        [
            RecommendationCandidate(
                jurisdiction="internal",
                purpose_tags=["learning", "recommendation"],
                practice_id=practice.practice_id,
                practice_version_id=practice.practice_version_id,
                title=practice.title,
                difficulty=practice.difficulty,
                target_dimensions=practice.target_dimensions,
                locked=practice.locked,
                completed=practice.completed,
                diagnostic_match=practice.practice_id == diagnostic_practice_id,
            )
            for practice in practices
        ],
        signals,
        fallback_difficulty=fallback,  # type: ignore[arg-type]
        diagnostic_confidence=diagnostic_confidence,
    )
    selected_id = recommendation.recommended_practice_version_id
    practices = [
        practice.model_copy(
            update={"recommended": practice.practice_version_id == selected_id}
        )
        for practice in practices
    ]
    return LearningPlan(
        jurisdiction="internal",
        purpose_tags=["learning", "recommendation"],
        learner_id=learner_id,
        recommended_track_version_id=track_id,
        recommended_practice_version_id=selected_id,
        recommendation=recommendation,
        tracks=await _tracks(db, learner_id, track_id),
        practices=practices,
    )


class ScenarioDraftRequest(SovereignModel):
    brief: str = Field(min_length=20, max_length=1000)
    framework: str = Field(default="iso27001", min_length=2, max_length=64)


class ScenarioDraft(SovereignModel):
    scenario: dict[str, Any]
    published: bool = False
    provider: str
    model: str
    mode: str


@router.post("/scenario-drafts", response_model=ScenarioDraft)
async def create_scenario_draft(
    body: ScenarioDraftRequest,
    current_user: dict[str, Any] = Depends(require_permission(Permission.manage_curriculum)),
    db: AsyncSession = Depends(get_db),
) -> ScenarioDraft:
    """Create an unpublished customer scenario. A local model may draft the narrative."""
    org_id = str(current_user.get("org_id") or "")
    await bind_writable_org(db, current_user, org_id)
    actor = str(current_user.get("email") or current_user.get("sub") or "curriculum-admin")
    before = await append_audit_log(
        db,
        event_type="scenario.draft.start",
        entity_type="scenario_draft",
        entity_id=None,
        org_id=org_id,
        actor=actor,
        payload={"framework": body.framework},
    )
    drafted = await draft_customer_scenario(
        body.brief,
        framework=body.framework,
        author=actor,
    )
    await append_audit_log(
        db,
        event_type="scenario.draft.complete",
        entity_type="scenario_draft",
        entity_id=str(drafted["scenario"]["id"]),
        org_id=org_id,
        actor=actor,
        prev_hash_override=before,
        payload={"provider": drafted["provider"], "published": False},
    )
    return ScenarioDraft(
        jurisdiction=body.jurisdiction,
        purpose_tags=body.purpose_tags,
        **drafted,
    )
