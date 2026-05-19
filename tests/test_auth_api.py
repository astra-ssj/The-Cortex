# tests/test_auth_api.py — Registration, login, and bearer validation.

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from db.session import database_ready


def test_login_invalid_credentials_401(client: TestClient) -> None:
    r = client.post(
        "/api/v1/auth/token",
        data={"username": "ciso@astralabs.com", "password": "wrong-password-not-real"},
    )
    assert r.status_code == 401


def test_protected_route_without_token_401(client: TestClient) -> None:
    r = client.get("/api/v1/organisations/demo-org-001/posture")
    assert r.status_code == 401


def test_protected_route_invalid_token_401(client: TestClient) -> None:
    r = client.get(
        "/api/v1/organisations/demo-org-001/posture",
        headers={"Authorization": "Bearer not-a-valid-jwt"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_register_then_login_and_token_allows_org_scoped_read(client: TestClient) -> None:
    """Full DB-backed path: create tenant, login with form body, use JWT on org-scoped GET."""
    if not await database_ready():
        pytest.skip("database not reachable")

    suffix = uuid.uuid4().hex[:12]
    email = f"pytest-reg-{suffix}@example.com"
    password = "pytest-register-secure-12"

    reg = client.post(
        "/api/v1/auth/register",
        json={
            "company_name": f"Pytest Tenant {suffix}",
            "jurisdiction": "EU",
            "industry": "Technology",
            "email": email,
            "password": password,
            "full_name": "Pytest User",
        },
    )
    if reg.status_code == 503:
        pytest.skip("registration unavailable (migrations / DB)")
    assert reg.status_code == 200, reg.text
    body = reg.json()
    assert body.get("token_type") == "bearer"
    assert "access_token" in body
    assert "refresh_token" in body and len(body["refresh_token"]) > 10
    org_id = body["org_id"]
    assert org_id.startswith("org-")

    login_r = client.post(
        "/api/v1/auth/token",
        data={"username": email, "password": password},
    )
    assert login_r.status_code == 200, login_r.text
    login_body = login_r.json()
    token = login_body["access_token"]
    assert "refresh_token" in login_body and len(login_body["refresh_token"]) > 10

    posture_r = client.get(
        f"/api/v1/organisations/{org_id}/posture",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert posture_r.status_code == 200
    data = posture_r.json()
    assert data["organisationId"] == org_id
    assert "frameworks" in data
