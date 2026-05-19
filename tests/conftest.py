# tests/conftest.py — Shared fixtures (demo JWT for protected routes).

from __future__ import annotations

import os

# Must run before api.main import so api.limits sees it (SlowAPI /auth/token 10/min).
os.environ["CORTEX_DISABLE_RATE_LIMIT"] = "1"
os.environ["CORTEX_TESTING"] = "1"
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://cortex:cortex_ci_test@127.0.0.1:5432/cortex",
)

import pytest
from fastapi.testclient import TestClient

from api.main import app
from core.security import create_access_token

_DEMO_USER = "ciso@astralabs.com"
_DEMO_PASSWORD = "cortex-ciso-2026"


@pytest.fixture(scope="session")
def postgres_reachable() -> bool:
    """Sync Postgres probe — avoids asyncio.run() before TestClient (asyncpg loop conflicts)."""
    try:
        import psycopg2
    except ImportError:
        return False
    url = os.environ.get("DATABASE_URL", "")
    if "cortex_ci_test" in url or os.environ.get("PGPASSWORD"):
        host = os.environ.get("PGHOST", "127.0.0.1")
        port = int(os.environ.get("PGPORT", "5432"))
        user = os.environ.get("PGUSER", "cortex")
        password = os.environ.get("PGPASSWORD", "cortex_ci_test")
        dbname = os.environ.get("PGDATABASE", "cortex")
    else:
        host, port, user, password, dbname = "127.0.0.1", 5432, "cortex", "cortex_ci_test", "cortex"
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            dbname=dbname,
            connect_timeout=3,
        )
        conn.close()
        return True
    except Exception:
        return False


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """Signed demo JWT — no Postgres round-trip; safe with TestClient event loop."""
    token = create_access_token(
        {
            "sub": _DEMO_USER,
            "email": _DEMO_USER,
            "org_id": "demo-org-001",
            "role": "ciso",
            "is_demo": True,
            "onboarding_complete": True,
            "onboarding_step": 5,
        }
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def db_auth_headers(client: TestClient, postgres_reachable: bool) -> dict[str, str]:
    """DB-backed login (refresh token path); skips when Postgres is down."""
    if not postgres_reachable:
        pytest.skip("database not reachable")
    r = client.post(
        "/api/v1/auth/token",
        data={"username": _DEMO_USER, "password": _DEMO_PASSWORD},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
