# tests/test_auth_api.py — Registration, login, and bearer validation.

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import api.auth as auth_api
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
async def test_unknown_user_login_performs_dummy_password_check(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    checked_hashes: list[str] = []

    async def no_user(_session: object, _email: str) -> None:
        return None

    def record_check(_password: str, password_hash: str) -> bool:
        checked_hashes.append(password_hash)
        return False

    monkeypatch.setattr(auth_api, "_try_load_db_user", no_user)
    monkeypatch.setattr(auth_api, "verify_password", record_check)

    with pytest.raises(HTTPException) as exc:
        await auth_api.login(
            request=object(),  # type: ignore[arg-type]
            form_data=SimpleNamespace(username="unknown@example.com", password="not-secret"),
            session=AsyncMock(),
        )
    assert exc.value.status_code == 401
    assert checked_hashes == [auth_api._DUMMY_PASSWORD_HASH]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "principal",
    [
        {
            "sub": "ciso@astralabs.com",
            "user_id": "ciso@astralabs.com",
            "email": "ciso@astralabs.com",
            "org_id": "demo-org-001",
            "is_demo": True,
        },
        {
            "sub": "apikey:key-id",
            "user_id": "apikey:key-id",
            "org_id": "demo-org-001",
            "auth_kind": "api_key",
        },
    ],
)
async def test_logout_is_audited_noop_for_non_session_principals(
    monkeypatch: pytest.MonkeyPatch,
    principal: dict[str, object],
) -> None:
    audit = AsyncMock(side_effect=["start-hash", "complete-hash"])
    revoke = AsyncMock()
    monkeypatch.setattr(auth_api, "append_audit_log", audit)
    monkeypatch.setattr(auth_api, "revoke_refresh_token_for_user", revoke)

    result = await auth_api.logout_session(
        body=auth_api.LogoutBody(refresh_token="not-a-browser-refresh-token"),
        current_user=principal,
        session=AsyncMock(),
    )

    assert result == {"message": "Session ended"}
    assert audit.await_count == 2
    revoke.assert_not_awaited()


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
async def test_logout_is_owned_idempotent_and_refresh_rotates_under_rls(
    client: TestClient,
) -> None:
    if not await database_ready():
        pytest.skip("database not reachable")

    async def register(label: str) -> dict[str, str]:
        suffix = uuid.uuid4().hex[:12]
        response = client.post(
            "/api/v1/auth/register",
            json={
                "company_name": f"Logout Tenant {label} {suffix}",
                "jurisdiction": "EU",
                "industry": "Technology",
                "email": f"pytest-logout-{label}-{suffix}@example.com",
                "password": "pytest-logout-secure-12",
                "full_name": f"Logout User {label}",
            },
        )
        if response.status_code == 503:
            pytest.skip("registration unavailable (migrations / DB)")
        assert response.status_code == 200, response.text
        return response.json()

    first = await register("first")
    second = await register("second")
    first_headers = {"Authorization": f"Bearer {first['access_token']}"}

    # A caller cannot revoke another user's refresh token.
    foreign = client.post(
        "/api/v1/auth/logout",
        headers=first_headers,
        json={"refresh_token": second["refresh_token"]},
    )
    assert foreign.status_code == 200
    assert foreign.json() == {"message": "Session ended"}

    refreshed_second = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": second["refresh_token"]},
    )
    assert refreshed_second.status_code == 200, refreshed_second.text
    assert refreshed_second.json()["refresh_token"] != second["refresh_token"]

    ended = client.post(
        "/api/v1/auth/logout",
        headers=first_headers,
        json={"refresh_token": first["refresh_token"]},
    )
    repeated = client.post(
        "/api/v1/auth/logout",
        headers=first_headers,
        json={"refresh_token": first["refresh_token"]},
    )
    unknown = client.post(
        "/api/v1/auth/logout",
        headers=first_headers,
        json={"refresh_token": "x"},
    )
    assert ended.status_code == repeated.status_code == unknown.status_code == 200
    assert ended.json() == repeated.json() == unknown.json() == {"message": "Session ended"}

    rejected = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": first["refresh_token"]},
    )
    assert rejected.status_code == 401


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
