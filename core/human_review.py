# core/human_review.py — Human-review backlog counters and ingestion enqueue (Postgres).

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import database_ready, engine

logger = structlog.get_logger()

# Shown in the Review Queue's Framework column. Distinguishes an item raised by a
# learner's decision from one raised by an automated control assessment, because a
# reviewer opens the transcript for one and the evidence for the other.
LEARNING_REVIEW_FRAMEWORK = "ISO/IEC 27001:2022 · Learning Loop"


async def enqueue_assessment_human_review(
    session: AsyncSession,
    *,
    org_id: str,
    item_id: str,
    framework: str,
    control_id: str,
    name: str,
    assessment: str,
    confidence: float,
    severity: str,
    reference: str,
) -> None:
    """Persist low-confidence control assessment for the Review Queue UI."""
    flagged = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    await session.execute(
        text(
            """
            INSERT INTO human_review_pending (
                id, org_id, framework, control_id, name, assessment, confidence,
                severity, reference, date_flagged
            )
            VALUES (
                :id, :org_id, :framework, :control_id, :name, :assessment, :confidence,
                :severity, :reference, CAST(:date_flagged AS timestamptz)
            )
            ON CONFLICT (org_id, id) DO UPDATE SET
                assessment = EXCLUDED.assessment,
                confidence = EXCLUDED.confidence,
                severity = EXCLUDED.severity,
                reference = EXCLUDED.reference,
                date_flagged = EXCLUDED.date_flagged
            """
        ),
        {
            "id": item_id,
            "org_id": org_id,
            "framework": framework,
            "control_id": control_id,
            "name": name,
            "assessment": assessment,
            "confidence": confidence,
            "severity": severity,
            "reference": reference,
            "date_flagged": flagged,
        },
    )


async def enqueue_learning_decision_review(
    session: AsyncSession,
    *,
    org_id: str,
    session_id: str,
    learner_id: str,
    scenario_slug: str,
    scenario_title: str,
    stage: str,
    choice_id: str,
    control_id: str,
    confidence: float,
    severity: str,
    reference: str,
) -> str:
    """
    Route one graded learning decision to a human reviewer.

    The Review Queue used to serve eight hardcoded GDPR/NIS2/EU-AI-Act rows, which
    made it the same kind of theatre Control Gaps was: a queue nobody's actions
    could ever change. Items now come from graded decisions, using the same
    sub-0.75 confidence convention as core/assessment_llm.py — below that
    threshold the platform does not consider its own automated grade sufficient
    to stand alone.

    The item id is deterministic per (session, stage), so replaying a stage
    updates the row rather than growing the queue. Returns the item id.
    """
    item_id = f"learn-{session_id[:8]}-{stage}"[:120]
    flagged = datetime.now(timezone.utc)

    await session.execute(
        text(
            """
            INSERT INTO human_review_pending (
                id, org_id, framework, control_id, name, assessment, confidence,
                severity, reference, date_flagged
            )
            VALUES (
                :id, :org_id, :framework, :control_id, :name, :assessment, :confidence,
                :severity, :reference, :date_flagged
            )
            ON CONFLICT (org_id, id) DO UPDATE SET
                name = EXCLUDED.name,
                assessment = EXCLUDED.assessment,
                confidence = EXCLUDED.confidence,
                severity = EXCLUDED.severity,
                reference = EXCLUDED.reference,
                date_flagged = EXCLUDED.date_flagged
            """
        ),
        {
            "id": item_id,
            "org_id": org_id,
            "framework": LEARNING_REVIEW_FRAMEWORK,
            "control_id": control_id,
            "name": (
                f"{scenario_title} · {stage}: learner chose '{choice_id}' "
                "against the reference answer"
            )[:500],
            "assessment": "NON_COMPLIANT",
            "confidence": confidence,
            "severity": severity,
            "reference": reference[:500],
            "date_flagged": flagged,
        },
    )
    logger.info(
        "learning_decision_review_enqueued",
        org_id=org_id,
        learner_id=learner_id,
        scenario=scenario_slug,
        stage=stage,
        confidence=confidence,
    )
    return item_id


async def enqueue_ingestion_human_review(
    session: AsyncSession,
    org_id: str,
    document_id: str,
    confidence: float,
) -> None:
    """Persist low-confidence ontology mapping for human follow-up (same transaction as caller)."""
    await session.execute(
        text(
            """
            INSERT INTO human_review_ingestion_pending (org_id, document_id, confidence)
            VALUES (:org_id, :document_id, :confidence)
            ON CONFLICT (org_id, document_id) DO UPDATE SET
                confidence = EXCLUDED.confidence,
                created_at = now()
            """
        ),
        {"org_id": org_id, "document_id": document_id, "confidence": confidence},
    )


async def human_review_pending_total_async(org_id: str) -> int:
    """Count one tenant's assessment QA queue plus ingestion backlog."""
    if not await database_ready():
        return 0
    total = 0
    try:
        async with engine.connect() as conn:
            try:
                total += int(
                    (
                        await conn.execute(
                            text("SELECT COUNT(*) FROM human_review_pending WHERE org_id = :org_id"),
                            {"org_id": org_id},
                        )
                    ).scalar_one()
                )
            except Exception as e:
                logger.warning("human_review_pending_count_failed", error=str(e))
            try:
                total += int(
                    (
                        await conn.execute(
                            text("SELECT COUNT(*) FROM human_review_ingestion_pending WHERE org_id = :org_id"),
                            {"org_id": org_id},
                        )
                    ).scalar_one()
                )
            except Exception as e:
                logger.warning("human_review_ingestion_count_failed", error=str(e))
    except Exception as e:
        logger.warning("human_review_pending_total_failed", error=str(e))
    return total
