# services/posture_calculator.py — Real posture scores from framework controls and org context.
# Lightweight scoring (no LLM); trend from assessment_results history.

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from compliance import FrameworkId, get
from compliance.models import Control, Framework

# Typed dict for framework posture (matches API shape).
FrameworkPostureDict = dict[str, Any]


def _framework_id_from_str(framework_id: str) -> FrameworkId | None:
    """Resolve FrameworkId from string value; None if unknown."""
    try:
        fid = FrameworkId(framework_id)
        return fid if get(fid) is not None else None
    except ValueError:
        return None


def _score_control(control: Control, org_context: dict[str, Any]) -> float:
    """Score a single control from org maturity indicators. Higher weight = harder to satisfy."""
    base = float(org_context.get("maturity_score", 0.4))
    weight = getattr(control, "weight", 1.0)
    return min(1.0, base + (0.3 / max(0.1, weight)))


def _status(score: float) -> str:
    """Map 0–100 score to COMPLIANT | PARTIAL | NON_COMPLIANT."""
    if score >= 85:
        return "COMPLIANT"
    if score >= 60:
        return "PARTIAL"
    return "NON_COMPLIANT"


def _risk(score: float) -> str:
    """Map 0–100 score to risk level."""
    if score >= 85:
        return "LOW"
    if score >= 70:
        return "MEDIUM"
    if score >= 50:
        return "HIGH"
    return "CRITICAL"


class PostureCalculator:
    """Computes framework posture from control-level scores and org context. No LLM."""

    def calculate_framework_posture(
        self,
        framework_id: str,
        org_context: dict[str, Any],
    ) -> FrameworkPostureDict:
        """
        Compute posture for one framework from control weights and org maturity.
        Returns dict with score, status, risk_level, gap_count, trend=0 (set trend separately via get_trend).
        """
        fid = _framework_id_from_str(framework_id)
        if fid is None:
            raise ValueError(f"Unknown or unregistered framework: {framework_id}")
        from typing import Optional
        framework: Optional[Framework] = get(fid)
        if framework is None:
            raise ValueError(f"Framework not found: {framework_id}")

        total_controls = len(framework.controls)
        if total_controls == 0:
            avg_score = 0.0
            gaps = 0
        else:
            scores: list[float] = []
            gaps = 0
            for control in framework.controls:
                s = _score_control(control, org_context)
                scores.append(s)
                if s < 0.7:
                    gaps += 1
            avg_score = (sum(scores) / len(scores)) * 100.0

        return {
            "framework_id": framework_id,
            "framework_name": framework.name,
            "score": round(avg_score),
            "status": _status(avg_score),
            "risk_level": _risk(avg_score),
            "control_count": total_controls,
            "gap_count": gaps,
            "trend": 0.0,
            "jurisdiction": framework.jurisdiction,
            "last_assessed": datetime.now(timezone.utc).isoformat(),
        }

    async def get_trend(
        self,
        session: AsyncSession,
        org_id: str,
        framework_id: str,
    ) -> float:
        """
        Trend = current_score - previous_score from assessment_results.
        Returns 0.0 if fewer than two results.
        """
        result = await session.execute(
            text(
                """
                SELECT score FROM assessment_results
                WHERE org_id = :org_id AND framework_id = :framework_id
                ORDER BY assessed_at DESC LIMIT 2
                """
            ),
            {"org_id": org_id, "framework_id": framework_id},
        )
        rows = result.scalars().all()
        if len(rows) < 2:
            return 0.0
        return float(rows[0][0] - rows[1][0])

    async def save_assessment_result(
        self,
        session: AsyncSession,
        org_id: str,
        framework_id: str,
        score: float,
        gap_count: int,
    ) -> None:
        """Persist one framework assessment for trend history."""
        await session.execute(
            text(
                """
                INSERT INTO assessment_results (org_id, framework_id, score, gap_count)
                VALUES (:org_id, :framework_id, :score, :gap_count)
                """
            ),
            {"org_id": org_id, "framework_id": framework_id, "score": score, "gap_count": gap_count},
        )
