# core/tenant.py — Tenant isolation helpers (ZTAIP): scoped org id + RLS session bind.

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

DEMO_ORG_ID = "demo-org-001"


def resolve_scoped_org_id(current_user: dict[str, Any], requested_org_id: str) -> str:
    """
    Data may only be read for the caller's organisation or for the shared demo dataset.

    Authenticated users may request demo-org-001 explicitly (UI demo toggle). Any other
    cross-tenant path org id is rejected.
    """
    uid_org = str(current_user.get("org_id") or "")
    req = (requested_org_id or "").strip()
    if not req:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="organisation id required")
    if req == uid_org:
        return req
    if req == DEMO_ORG_ID:
        return DEMO_ORG_ID
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not allowed to access this organisation",
    )


def resolve_writable_org_id(
    current_user: dict[str, Any],
    requested_org_id: str,
) -> str:
    """Resolve a tenant mutation and reject cross-tenant writes to shared demo data."""
    effective = resolve_scoped_org_id(current_user, requested_org_id)
    caller_org = str(current_user.get("org_id") or "").strip()
    if effective == DEMO_ORG_ID and caller_org != DEMO_ORG_ID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The shared demo organisation is read-only",
        )
    return effective


async def set_tenant_context(session: AsyncSession, org_id: str) -> None:
    """
    Bind this DB transaction to a tenant for Postgres RLS.

    Uses set_config(..., is_local=true) ≡ SET LOCAL so the GUC lasts only for
    the current transaction — the same connection cannot leak org context to
    the next checkout after commit/rollback.
    """
    oid = (org_id or "").strip()
    if not oid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organisation id required for tenant context",
        )
    await session.execute(
        text("SELECT set_config('app.current_org', :org_id, true)"),
        {"org_id": oid},
    )


async def bind_scoped_org(
    session: AsyncSession,
    current_user: dict[str, Any],
    requested_org_id: str,
) -> str:
    """Resolve scoped org (JWT or demo) and set RLS session var in one step."""
    effective = resolve_scoped_org_id(current_user, requested_org_id)
    await set_tenant_context(session, effective)
    return effective


async def bind_writable_org(
    session: AsyncSession,
    current_user: dict[str, Any],
    requested_org_id: str,
) -> str:
    """
    Bind a tenant for mutation while keeping the shared demo dataset read-only.

    Principals whose own JWT/API-key organisation is the demo tenant may still
    operate the interactive demo. Other tenants can inspect it, but cannot
    contaminate shared evidence, findings, or learning history.
    """
    effective = resolve_writable_org_id(current_user, requested_org_id)
    await set_tenant_context(session, effective)
    return effective
