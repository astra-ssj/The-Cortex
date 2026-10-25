# tests/test_audit_fabric.py — Audit fabric persists to audit_log when Postgres is available.

from __future__ import annotations

import asyncio

import pytest

from core.audit_fabric import audit_fabric
from db.session import database_ready


@pytest.mark.asyncio
async def test_audit_fabric_persist_increments_total() -> None:
    """After log(), DB row count increases (integration; skips without DB)."""
    if not await database_ready():
        pytest.skip("database not reachable")
    org_id = "demo-org-001"
    before = await audit_fabric.total_events_async(org_id)
    audit_fabric.log(
        "pytest_audit_probe",
        entity_type="test",
        entity_id="audit-fabric-integration",
        org_id=org_id,
        payload={"probe": True, "org_id": org_id},
    )
    after = before
    for _ in range(20):
        await asyncio.sleep(0.05)
        after = await audit_fabric.total_events_async(org_id)
        if after >= before + 1:
            break
    assert after >= before + 1
