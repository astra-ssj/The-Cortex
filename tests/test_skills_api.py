from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_all_skills_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/skills/status").status_code == 401
    assert client.get("/api/v1/skills/does-not-exist/context").status_code == 401


def test_skills_status_accepts_authenticated_principal(
    client: TestClient,
    auth_headers: dict[str, str],
    postgres_reachable: bool,
) -> None:
    if not postgres_reachable:
        pytest.skip("database not reachable")
    response = client.get("/api/v1/skills/status", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
