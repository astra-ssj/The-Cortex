# api/limits.py — shared SlowAPI limiter for auth and other sensitive routes.

import hashlib
import os

import jwt
from fastapi import Request
from jwt.exceptions import InvalidTokenError
from slowapi import Limiter


def _env_enabled(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def client_ip_rate_limit_key(request: Request) -> str:
    """
    Key anonymous traffic by the direct peer unless a trusted proxy is explicit.

    Blindly accepting X-Forwarded-For lets callers rotate a header to evade auth
    throttles. Operators terminating traffic at a controlled proxy can opt in.
    """
    if _env_enabled("CORTEX_TRUST_PROXY_HEADERS"):
        forwarded = request.headers.get("X-Forwarded-For", "")
        first_hop = forwarded.split(",", 1)[0].strip()
        if first_hop:
            return first_hop
    return request.client.host if request.client else "unknown"


def authenticated_rate_limit_key(request: Request) -> str:
    """Key expensive authenticated work by tenant and principal, never spoofable headers."""
    principal = getattr(request.state, "rate_limit_principal", None)
    if not isinstance(principal, dict):
        # SlowAPI's middleware checks limits before FastAPI resolves auth
        # dependencies. Verify the signed token here so untrusted claims never
        # become attacker-selected buckets. SSE may carry the token in query.
        token = ""
        authorization = request.headers.get("Authorization", "")
        if authorization.startswith("Bearer "):
            token = authorization[7:].strip()
        if not token:
            token = request.query_params.get("token", "").strip()
        if token:
            from core.security import ALGORITHM, SECRET_KEY

            try:
                principal = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            except InvalidTokenError:
                principal = None
    if isinstance(principal, dict):
        org_id = str(principal.get("org_id") or "").strip()
        principal_id = str(
            principal.get("user_id")
            or principal.get("sub")
            or principal.get("api_key_id")
            or principal.get("email")
            or ""
        ).strip()
        if org_id and principal_id:
            return f"org:{org_id}:principal:{principal_id}"
        if org_id:
            return f"org:{org_id}"
    api_key = request.headers.get("X-API-Key", "").strip()
    if api_key:
        digest = hashlib.sha256(api_key.encode()).hexdigest()
        return f"api-key:{digest}"
    return f"ip:{client_ip_rate_limit_key(request)}"


# Pytest + shared TestClient exhaust auth limits — set CORTEX_DISABLE_RATE_LIMIT=1 in tests.
_rate_limits_enabled = os.getenv("CORTEX_DISABLE_RATE_LIMIT", "").lower() not in ("1", "true", "yes")
limiter = Limiter(key_func=client_ip_rate_limit_key, enabled=_rate_limits_enabled)
