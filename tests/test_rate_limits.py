from __future__ import annotations

from fastapi import Request

from api.limits import authenticated_rate_limit_key, client_ip_rate_limit_key
from core.security import create_access_token


def _request(
    *,
    forwarded_for: str | None = None,
    authorization: str | None = None,
    api_key: str | None = None,
) -> Request:
    headers = []
    if forwarded_for is not None:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))
    if authorization is not None:
        headers.append((b"authorization", authorization.encode()))
    if api_key is not None:
        headers.append((b"x-api-key", api_key.encode()))
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": headers,
            "client": ("203.0.113.10", 4321),
            "server": ("testserver", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )


def test_forwarded_for_is_ignored_by_default(monkeypatch) -> None:
    monkeypatch.delenv("CORTEX_TRUST_PROXY_HEADERS", raising=False)
    request = _request(forwarded_for="198.51.100.7")
    assert client_ip_rate_limit_key(request) == "203.0.113.10"


def test_forwarded_for_requires_explicit_trusted_proxy(monkeypatch) -> None:
    monkeypatch.setenv("CORTEX_TRUST_PROXY_HEADERS", "true")
    request = _request(forwarded_for="198.51.100.7, 203.0.113.2")
    assert client_ip_rate_limit_key(request) == "198.51.100.7"


def test_authenticated_key_is_tenant_and_principal_aware() -> None:
    request = _request(forwarded_for="198.51.100.7")
    request.state.rate_limit_principal = {
        "org_id": "org-a",
        "user_id": "user-42",
    }
    assert authenticated_rate_limit_key(request) == "org:org-a:principal:user-42"


def test_authenticated_key_verifies_token_before_dependency_resolution() -> None:
    token = create_access_token({"sub": "user-7", "org_id": "org-b"})
    request = _request(authorization=f"Bearer {token}")
    assert authenticated_rate_limit_key(request) == "org:org-b:principal:user-7"


def test_api_key_is_hashed_for_principal_bucket() -> None:
    request = _request(api_key="cortex-secret-service-key")
    key = authenticated_rate_limit_key(request)
    assert key.startswith("api-key:")
    assert "cortex-secret-service-key" not in key
