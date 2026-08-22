# tests/conftest.py — Shared fixtures (demo JWT for protected routes).

from __future__ import annotations

import os
import uuid
from typing import Any

# Must run before api.main import so api.limits sees it (SlowAPI /auth/token 10/min).
os.environ["CORTEX_DISABLE_RATE_LIMIT"] = "1"
os.environ["CORTEX_TESTING"] = "1"
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://cortex_app:cortex_ci_test@127.0.0.1:5432/cortex",
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


def make_auth_headers(
    role: str,
    *,
    org_id: str = "demo-org-001",
    email: str = "rbac-test@cortex.local",
) -> dict[str, str]:
    token = create_access_token(
        {
            "sub": email,
            "email": email,
            "org_id": org_id,
            "role": role,
            "is_demo": True,
            "onboarding_complete": True,
            "onboarding_step": 5,
        }
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """Admin-capable demo JWT (maps legacy CISO → admin on server)."""
    return make_auth_headers("ciso", email=_DEMO_USER)


@pytest.fixture
def analyst_headers() -> dict[str, str]:
    return make_auth_headers("analyst")


@pytest.fixture
def viewer_headers() -> dict[str, str]:
    return make_auth_headers("viewer")


@pytest.fixture
def admin_headers() -> dict[str, str]:
    return make_auth_headers("admin")


@pytest.fixture
def manual_finding(postgres_reachable: bool) -> Any:
    """
    A single authored control gap on demo-org-001.

    Control Gaps used to ship twelve hardcoded rows, so tests could assume a
    finding already existed. Rows now come from learner action (core/gaps.py), and
    an empty table on a fresh install is the intended behaviour — so any test that
    needs a finding has to create one. `source` is 'manual', which keeps the
    competency close-by-retake guard out of the way.
    """
    if not postgres_reachable:
        pytest.skip("database not reachable")

    import psycopg2

    finding_id = f"finding-fixture-{uuid.uuid4().hex[:10]}"
    url = os.environ.get("DATABASE_URL", "")
    conn = psycopg2.connect(
        host=os.environ.get("PGHOST", "127.0.0.1"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "cortex"),
        password=os.environ.get("PGPASSWORD", "cortex_ci_test" if "cortex_ci_test" in url else "cortex_ci_test"),
        dbname=os.environ.get("PGDATABASE", "cortex"),
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO findings (
                    id, org_id, title, framework, framework_id, control_id,
                    control_name, severity, status, owner, priority, entity_code,
                    current_state, required_state, actions, source
                ) VALUES (
                    %s, 'demo-org-001', 'Penetration test overdue',
                    'ISO/IEC 27001:2022', 'iso27001-2022', 'A.8.8',
                    'Management of technical vulnerabilities', 'CRITICAL', 'OPEN',
                    'CTO', 'P1', 'DE', 'Last test 18 months ago',
                    'Annual test with remediation evidence',
                    '["Procure a provider", "Scope the test"]'::jsonb, 'manual'
                )
                """,
                (finding_id,),
            )
        yield finding_id
        with conn.cursor() as cur:
            cur.execute("DELETE FROM findings WHERE id = %s", (finding_id,))
    finally:
        conn.close()


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
