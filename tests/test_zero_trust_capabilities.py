# tests/test_zero_trust_capabilities.py — Black-box proof: RLS isolation + durable append-only audit.

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from core.audit_fabric import append_audit_log, audit_fabric
from core.security import create_access_token
from core.tenant import set_tenant_context
from db.session import async_session_factory, database_ready, engine


def _jwt_for_org(org_id: str, email: str | None = None) -> str:
    mail = email or f"zt-{org_id}@example.com"
    return create_access_token(
        {
            "sub": str(uuid.uuid4()),
            "email": mail,
            "org_id": org_id,
            "role": "ADMIN",
            "onboarding_complete": True,
            "onboarding_step": 5,
        }
    )


@pytest.mark.asyncio
async def test_a_cross_tenant_non_demo_posture_returns_403(client: TestClient) -> None:
    """TEST A — Org 2 must not access a non-demo Org 1 id (app + RLS gate → 403)."""
    token = _jwt_for_org("org-tenant-zt-b")
    r = client.get(
        "/api/v1/organisations/org-tenant-zt-a/posture",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_a_rls_hides_other_tenant_rows_without_where() -> None:
    """DB-enforced isolation: with app.current_org=B, SELECT findings returns no org-A rows."""
    if not await database_ready():
        pytest.skip("database not reachable")

    org_a = f"org-rls-a-{uuid.uuid4().hex[:8]}"
    org_b = f"org-rls-b-{uuid.uuid4().hex[:8]}"
    finding_id = f"finding-rls-{uuid.uuid4().hex[:8]}"

    async with async_session_factory() as session:
        await set_tenant_context(session, org_a)
        await session.execute(
            text(
                """
                INSERT INTO organizations (id, name, jurisdiction, purpose_tags)
                VALUES (:id, :name, 'EU', '[]'::jsonb)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": org_a, "name": "RLS Tenant A"},
        )
        await session.commit()

    async with async_session_factory() as session:
        await set_tenant_context(session, org_b)
        await session.execute(
            text(
                """
                INSERT INTO organizations (id, name, jurisdiction, purpose_tags)
                VALUES (:id, :name, 'EU', '[]'::jsonb)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": org_b, "name": "RLS Tenant B"},
        )
        await session.commit()

    async with async_session_factory() as session:
        await set_tenant_context(session, org_a)
        await session.execute(
            text(
                """
                INSERT INTO findings (id, org_id, title, severity, status)
                VALUES (:id, :org, 'RLS probe finding', 'HIGH', 'OPEN')
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"id": finding_id, "org": org_a},
        )
        await session.commit()

    async with async_session_factory() as session:
        await set_tenant_context(session, org_b)
        # Deliberately omit WHERE org_id — RLS must still hide org A's row.
        rows = (
            await session.execute(text("SELECT id, org_id FROM findings"))
        ).mappings().all()
        leaked = [r for r in rows if r["org_id"] == org_a or r["id"] == finding_id]
        assert leaked == [], f"RLS leaked cross-tenant rows: {leaked}"


@pytest.mark.asyncio
async def test_b_audit_survives_reload_of_tail() -> None:
    """TEST B — audit row remains after fabric reloads tail from DB (restart surrogate)."""
    if not await database_ready():
        pytest.skip("database not reachable")

    action = f"zt_audit_probe_{uuid.uuid4().hex[:10]}"
    async with async_session_factory() as session:
        await append_audit_log(
            session,
            action=action,
            resource_type="test",
            resource_id="durability",
            org_id="demo-org-001",
            actor="pytest",
            payload={"probe": True},
        )
        await session.commit()

    # Simulate API restart: new fabric state loads tail from table, not empty memory.
    await audit_fabric.load_tail()
    assert audit_fabric._tail_hash is not None

    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text("SELECT action, hash FROM audit_log WHERE action = :a LIMIT 1"),
                {"a": action},
            )
        ).first()
    assert row is not None
    assert row[0] == action
    assert row[1]


@pytest.mark.asyncio
async def test_c_audit_log_delete_is_denied() -> None:
    """TEST C — DELETE on audit_log must fail (REVOKE and/or append-only trigger)."""
    if not await database_ready():
        pytest.skip("database not reachable")

    async with engine.begin() as conn:
        with pytest.raises(Exception) as exc_info:
            await conn.execute(text("DELETE FROM audit_log WHERE true"))
    msg = str(exc_info.value).lower()
    assert (
        "permission denied" in msg
        or "append-only" in msg
        or "42501" in msg
        or "insufficientprivilege" in msg.replace(" ", "")
    ), f"expected permission/append-only failure, got: {exc_info.value}"


@pytest.mark.asyncio
async def test_c_audit_log_update_is_denied() -> None:
    if not await database_ready():
        pytest.skip("database not reachable")

    async with engine.begin() as conn:
        with pytest.raises(Exception) as exc_info:
            await conn.execute(text("UPDATE audit_log SET action = action WHERE true"))
    msg = str(exc_info.value).lower()
    assert (
        "permission denied" in msg
        or "append-only" in msg
        or "42501" in msg
        or "insufficientprivilege" in msg.replace(" ", "")
    ), f"expected permission/append-only failure, got: {exc_info.value}"


def test_a_register_org_cannot_read_foreign_non_demo(
    client: TestClient, postgres_reachable: bool
) -> None:
    """End-to-end: registered org T2 gets 403 on another non-demo org id."""
    if not postgres_reachable:
        pytest.skip("database not reachable")

    suffix = uuid.uuid4().hex[:10]
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "company_name": f"ZT Tenant {suffix}",
            "jurisdiction": "EU",
            "industry": "Technology",
            "email": f"zt-{suffix}@example.com",
            "password": "zt-secure-password-12",
            "full_name": "ZT User",
        },
    )
    if reg.status_code == 503:
        pytest.skip("registration unavailable")
    assert reg.status_code == 200, reg.text
    t2 = reg.json()["access_token"]
    foreign = f"org-foreign-{suffix}"
    r = client.get(
        f"/api/v1/organisations/{foreign}/posture",
        headers={"Authorization": f"Bearer {t2}"},
    )
    assert r.status_code == 403
