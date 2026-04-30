# core/tenant.py — Tenant isolation helpers (ZTAIP): scoped org id from JWT + route param.

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

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
