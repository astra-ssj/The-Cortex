from __future__ import annotations

from fastapi.testclient import TestClient


def test_practices_route_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/skills/practices").status_code == 401


def test_practices_accept_an_authenticated_principal(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    practices = client.get("/api/v1/skills/practices", headers=auth_headers)
    assert practices.status_code == 200
    body = practices.json()
    assert len(body) == 15
    assert all(practice["status"] == "available" for practice in body)
    assert all(practice["review_state"] == "reviewed" for practice in body)
    assert body[0]["purpose_tags"] == ["learning", "competency"]
    assert "content" not in body[0]


def test_generic_skill_loader_routes_are_not_exposed(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    assert client.get("/api/v1/skills/status", headers=auth_headers).status_code == 404
    assert (
        client.get("/api/v1/skills/does-not-exist/context", headers=auth_headers).status_code
        == 404
    )
