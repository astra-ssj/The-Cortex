# tests/test_auth.py — Login (JWT) and /me endpoint tests.

from __future__ import annotations

from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_login_success() -> None:
    r = client.post(
        "/api/v1/auth/token",
        data={"username": "ciso@astralabs.com", "password": "cortex-ciso-2026"},
    )
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_wrong_password() -> None:
    r = client.post(
        "/api/v1/auth/token",
        data={"username": "ciso@astralabs.com", "password": "wrong"},
    )
    assert r.status_code == 401


def test_login_wrong_email() -> None:
    r = client.post(
        "/api/v1/auth/token",
        data={"username": "nobody@astralabs.com", "password": "cortex-ciso-2026"},
    )
    assert r.status_code == 401


def test_get_me_no_token() -> None:
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_get_me_with_token() -> None:
    login = client.post(
        "/api/v1/auth/token",
        data={"username": "ciso@astralabs.com", "password": "cortex-ciso-2026"},
    )
    token = login.json()["access_token"]
    r = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "ciso"
