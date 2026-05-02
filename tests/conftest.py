# tests/conftest.py — Shared fixtures (demo JWT for protected routes).

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.main import app

_DEMO_USER = "ciso@astralabs.com"
_DEMO_PASSWORD = "cortex-ciso-2026"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    r = client.post(
        "/api/v1/auth/token",
        data={"username": _DEMO_USER, "password": _DEMO_PASSWORD},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
