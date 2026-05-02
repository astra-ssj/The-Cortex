# tests/test_request_id_middleware.py — X-Request-ID propagation on responses.

from __future__ import annotations

from fastapi.testclient import TestClient


def test_x_request_id_echoed_when_provided(client: TestClient) -> None:
    r = client.get("/health", headers={"X-Request-ID": "trace-from-client"})
    assert r.status_code == 200
    assert r.headers.get("x-request-id") == "trace-from-client"


def test_x_request_id_generated_when_missing(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    rid = r.headers.get("x-request-id")
    assert rid and len(rid) >= 8
