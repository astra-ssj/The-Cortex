# tests/test_evidence_persistence.py — Finding ↔ evidence attachment against Postgres.

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from api.findings import attach_evidence_to_finding
from core.tenant import set_tenant_context
from db.session import async_session_factory, database_ready


@pytest.mark.asyncio
async def test_attach_evidence_to_finding_idempotent() -> None:
    """Linking the same evidence id twice must not double-count it."""
    if not await database_ready():
        pytest.skip("database not reachable")

    org_id = f"org-evi-{uuid.uuid4().hex[:8]}"
    finding_id = f"finding-evi-{uuid.uuid4().hex[:8]}"

    async with async_session_factory() as session:
        await set_tenant_context(session, org_id)
        await session.execute(
            text(
                """
                INSERT INTO organizations (id, name, jurisdiction, purpose_tags)
                VALUES (:id, 'Evidence Tenant', 'EU', '[]'::jsonb)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": org_id},
        )
        await session.execute(
            text(
                """
                INSERT INTO findings (id, org_id, title, severity, status)
                VALUES (:id, :org_id, 'Evidence attachment fixture', 'MEDIUM', 'OPEN')
                """
            ),
            {"id": finding_id, "org_id": org_id},
        )
        await session.commit()

        # set_tenant_context binds the GUC with is_local=true, so committing above
        # ended the transaction that carried it and RLS would now hide the row.
        await set_tenant_context(session, org_id)
        for _ in range(2):
            assert await attach_evidence_to_finding(
                session,
                finding_id,
                evidence_id="e-test-001",
                title="Breach procedure upload",
                document_id="doc-abc",
            )
        await session.commit()

        await set_tenant_context(session, org_id)
        stored = (
            await session.execute(
                text("SELECT evidence FROM findings WHERE id = :id"),
                {"id": finding_id},
            )
        ).scalar()
        items = stored if isinstance(stored, list) else []
        assert sum(1 for e in items if e.get("id") == "e-test-001") == 1
        assert items[0]["document_id"] == "doc-abc"

        await session.execute(
            text("DELETE FROM findings WHERE id = :id"), {"id": finding_id}
        )
        await session.commit()


@pytest.mark.asyncio
async def test_attach_evidence_to_missing_finding_returns_false() -> None:
    if not await database_ready():
        pytest.skip("database not reachable")

    async with async_session_factory() as session:
        await set_tenant_context(session, f"org-evi-{uuid.uuid4().hex[:8]}")
        assert not await attach_evidence_to_finding(
            session,
            "finding-does-not-exist",
            evidence_id="e-test-002",
            title="Nothing to attach to",
        )
