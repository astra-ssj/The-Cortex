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


@pytest.mark.asyncio
async def test_invite_then_accept_puts_second_user_in_same_org(client: TestClient) -> None:
    """The enterprise wedge: one org, many learners. Register alone cannot do this."""
    if not await database_ready():
        pytest.skip("database not reachable")

    suffix = uuid.uuid4().hex[:12]
    admin_email = f"pytest-admin-{suffix}@example.com"
    learner_email = f"pytest-learner-{suffix}@example.com"
    password = "pytest-invite-secure-12"

    admin_reg = client.post(
        "/api/v1/auth/register",
        json={
            "company_name": f"Invite Tenant {suffix}",
            "jurisdiction": "EU",
            "industry": "Technology",
            "email": admin_email,
            "password": password,
            "full_name": "Admin User",
        },
    )
    if admin_reg.status_code == 503:
        pytest.skip("registration unavailable (migrations / DB)")
    assert admin_reg.status_code == 200, admin_reg.text
    admin_token = admin_reg.json()["access_token"]
    org_id = admin_reg.json()["org_id"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    listed = client.get("/api/v1/auth/users", headers=admin_headers)
    if listed.status_code == 503:
        pytest.skip("org_invitations schema not applied")
    assert listed.status_code == 200, listed.text
    assert len(listed.json()["users"]) == 1

    invited = client.post(
        "/api/v1/auth/invite",
        headers=admin_headers,
        json={"email": learner_email, "role": "ANALYST", "full_name": "Learner One"},
    )
    assert invited.status_code == 200, invited.text
    token = invited.json()["token"]
    assert token

    accepted = client.post(
        "/api/v1/auth/accept-invite",
        json={
            "token": token,
            "password": password,
            "full_name": "Learner One",
            "email": learner_email,
        },
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["org_id"] == org_id
    assert accepted.json()["role"] == "ANALYST"
    learner_token = accepted.json()["access_token"]

    listed_after = client.get("/api/v1/auth/users", headers=admin_headers)
    assert listed_after.status_code == 200
    emails = {u["email"] for u in listed_after.json()["users"]}
    assert emails == {admin_email, learner_email}

    # The learner is in the same org but cannot invite (not admin).
    denied = client.post(
        "/api/v1/auth/invite",
        headers={"Authorization": f"Bearer {learner_token}"},
        json={"email": f"other-{suffix}@example.com", "role": "VIEWER"},
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_list_users_is_admin_only(client: TestClient) -> None:
    if not await database_ready():
        pytest.skip("database not reachable")

    suffix = uuid.uuid4().hex[:12]
    viewer_headers = {
        "Authorization": (
            "Bearer "
            + __import__("core.security", fromlist=["create_access_token"]).create_access_token(
                {
                    "sub": f"viewer-{suffix}",
                    "email": f"viewer-{suffix}@example.com",
                    "org_id": "demo-org-001",
                    "role": "VIEWER",
                }
            )
        )
    }
    r = client.get("/api/v1/auth/users", headers=viewer_headers)
    assert r.status_code == 403
