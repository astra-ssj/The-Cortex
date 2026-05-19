# tests/test_tenant_isolation.py — Org A JWT cannot read org B resources.

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from core.security import create_access_token


def test_cross_tenant_posture_request_returns_403(client: TestClient) -> None:
    """Synthetic JWT for org-a must not access /organisations/org-b/posture (no DB required)."""
    token = create_access_token(
        {
            "sub": str(uuid.uuid4()),
            "email": "tenant-a@example.com",
            "org_id": "org-tenant-a-pytest",
            "role": "ADMIN",
            "onboarding_complete": True,
            "onboarding_step": 5,
        }
    )
    r = client.get(
        "/api/v1/organisations/org-tenant-b-other/posture",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


def test_cross_tenant_org_profile_returns_403(client: TestClient) -> None:
    token = create_access_token(
        {
            "sub": str(uuid.uuid4()),
            "email": "tenant-a@example.com",
            "org_id": "org-tenant-a-pytest",
            "role": "ADMIN",
            "onboarding_complete": True,
            "onboarding_step": 5,
        }
    )
    r = client.get(
        "/api/v1/organisations/org-tenant-b-other",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403
