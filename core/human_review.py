# core/human_review.py — Human-review backlog counters and ingestion enqueue (Postgres).

from __future__ import annotations

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import database_ready, engine

logger = structlog.get_logger()


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
