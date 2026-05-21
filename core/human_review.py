# core/human_review.py — Human-review backlog counters and ingestion enqueue (Postgres).

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import database_ready, engine

logger = structlog.get_logger()


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
                :severity, :reference, :date_flagged::timestamptz
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


async def human_review_pending_total_async() -> int:
    """Count assessment QA queue rows plus ingestion backlog rows."""
    if not await database_ready():
        return 0
    total = 0
    try:
        async with engine.connect() as conn:
            try:
                total += int((await conn.execute(text("SELECT COUNT(*) FROM human_review_pending"))).scalar_one())
            except Exception as e:
                logger.warning("human_review_pending_count_failed", error=str(e))
            try:
                total += int(
                    (await conn.execute(text("SELECT COUNT(*) FROM human_review_ingestion_pending"))).scalar_one()
                )
            except Exception as e:
                logger.warning("human_review_ingestion_count_failed", error=str(e))
    except Exception as e:
        logger.warning("human_review_pending_total_failed", error=str(e))
    return total
