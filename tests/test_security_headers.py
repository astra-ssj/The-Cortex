from __future__ import annotations

from fastapi.testclient import TestClient


def test_api_responses_include_security_headers(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "default-src 'none'" in response.headers["content-security-policy"]


def test_auth_responses_are_not_cacheable(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/token",
        data={"username": "missing@example.com", "password": "not-a-real-password"},
    )

    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"
