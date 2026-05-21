# tests/test_human_review_persistence.py — Approve / override persist to reviewed table.

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from core.tenant import DEMO_ORG_ID
from db.session import async_session_factory, database_ready


async def _cleanup_human_review_item(item_id: str) -> None:
    async with async_session_factory() as session:
        await session.execute(
            text("DELETE FROM human_review_reviewed WHERE org_id = :org AND item_id = :i"),
            {"org": DEMO_ORG_ID, "i": item_id},
        )
        await session.execute(
            text("DELETE FROM human_review_pending WHERE org_id = :org AND id = :i"),
            {"org": DEMO_ORG_ID, "i": item_id},
        )
        await session.commit()


async def _seed_pending_item(item_id: str) -> None:
    flagged = datetime.now(timezone.utc)
    async with async_session_factory() as session:
        await session.execute(
            text(
                """
                INSERT INTO human_review_pending (
                    id, org_id, framework, control_id, name, assessment, confidence,
                    severity, reference, date_flagged
                ) VALUES (
                    :id, :org_id, :framework, :control_id, :name, :assessment, :confidence,
                    :severity, :reference, :date_flagged
                )
                ON CONFLICT (org_id, id) DO NOTHING
                """
            ),
            {
                "id": item_id,
                "org_id": DEMO_ORG_ID,
                "framework": "pytest",
                "control_id": "HR-PERSIST-01",
                "name": "pytest human review fixture",
                "assessment": "NON_COMPLIANT",
                "confidence": 0.5,
                "severity": "LOW",
                "reference": "pytest",
                "date_flagged": flagged,
            },
        )
        await session.commit()


@pytest.mark.asyncio
async def test_approve_persists_to_reviewed(client: TestClient, auth_headers: dict[str, str]) -> None:
    if not await database_ready():
        pytest.skip("database not reachable")

    item_id = f"pytest-hr-{uuid.uuid4().hex[:10]}"
    await _cleanup_human_review_item(item_id)
    await _seed_pending_item(item_id)

    try:
        rq = client.get("/api/v1/assessments/review-queue", headers=auth_headers)
        if rq.status_code == 503:
            pytest.skip("human_review schema not applied")
        assert rq.status_code == 200

        approve = client.post(
            f"/api/v1/assessments/controls/{item_id}/approve",
            headers=auth_headers,
            json={"notes": "pytest approve — documented oversight decision."},
        )
        assert approve.status_code == 200, approve.text
        assert approve.json().get("status") == "approved"

        after = client.get("/api/v1/assessments/review-queue", headers=auth_headers)
        assert after.status_code == 200
        reviewed_ids = {x["id"] for x in after.json().get("reviewed", [])}
        assert item_id in reviewed_ids
        pending_ids = {x["id"] for x in after.json().get("items", [])}
        assert item_id not in pending_ids
    finally:
        await _cleanup_human_review_item(item_id)


@pytest.mark.asyncio
async def test_override_persists_to_reviewed(client: TestClient, admin_headers: dict[str, str]) -> None:
    if not await database_ready():
        pytest.skip("database not reachable")

    item_id = f"pytest-hr-{uuid.uuid4().hex[:10]}"
    await _cleanup_human_review_item(item_id)
    await _seed_pending_item(item_id)

    try:
        rq = client.get("/api/v1/assessments/review-queue", headers=admin_headers)
        if rq.status_code == 503:
            pytest.skip("human_review schema not applied")
        assert rq.status_code == 200

        ov = client.post(
            f"/api/v1/assessments/controls/{item_id}/override",
            headers=admin_headers,
            json={
                "assessment": "COMPLIANT",
                "justification": "pytest override — twenty chars minimum rationale here.",
            },
        )
        assert ov.status_code == 200, ov.text
        assert ov.json().get("status") == "overridden"

        after = client.get("/api/v1/assessments/review-queue", headers=admin_headers)
        assert after.status_code == 200
        reviewed = after.json().get("reviewed", [])
        match = next((x for x in reviewed if x["id"] == item_id), None)
        assert match is not None
        assert match.get("action") == "overridden"
    finally:
        await _cleanup_human_review_item(item_id)
