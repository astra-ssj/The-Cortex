# tests/test_security_hardening.py — Import-time fail-closed guards in core.security.
#
# These run in a subprocess: the guards fire at module import, so they cannot be
# exercised by mutating os.environ inside an already-imported test session.

from __future__ import annotations

import os
import subprocess
import sys

_REAL_SECRET = "unit-test-secret-minimum-32-characters-xx"

_STRIP = (
    "JWT_SECRET",
    "CORTEX_SECRET_KEY",
    "CORTEX_TESTING",
    "CORTEX_ALLOW_DEV_JWT_SECRET",
    "CORTEX_ENABLE_DEMO_USERS",
    "CORTEX_LEGACY_DEMO_PASSWORD",
    "CORTEX_ALLOW_TOKEN_BYPASS",
    "CORTEX_TOKEN_BYPASS_VALUE",
    "CORTEX_ENVIRONMENT",
    "CORTEX_ENV",
    "APP_ENV",
    "ENVIRONMENT",
)


def _run(code: str, **overrides: str) -> subprocess.CompletedProcess[str]:
    env = {k: v for k, v in os.environ.items() if k not in _STRIP}
    env["PYTHONPATH"] = "."
    env.update(overrides)
    return subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        env=env,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        timeout=60,
        check=False,
    )


def _printed(result: subprocess.CompletedProcess[str]) -> str:
    """Last stdout line — import-time structlog output shares the stream."""
    lines = [ln for ln in result.stdout.splitlines() if ln.strip()]
    return lines[-1].strip() if lines else ""


def test_missing_jwt_secret_refuses_to_start() -> None:
    """No signing key configured must abort import, not fall back to the committed dev key."""
    r = _run("import core.security")
    assert r.returncode != 0
    assert "JWT_SECRET" in r.stderr


def test_dev_jwt_secret_requires_explicit_opt_in() -> None:
    r = _run(
        "import core.security as s; print(s.SECRET_KEY == s._DEV_SECRET_DEFAULT)",
        CORTEX_ALLOW_DEV_JWT_SECRET="1",
    )
    assert r.returncode == 0, r.stderr
    assert _printed(r) == "True"


def test_configured_secret_is_used() -> None:
    r = _run(
        "import core.security as s; print(s.SECRET_KEY)",
        JWT_SECRET=_REAL_SECRET,
    )
    assert r.returncode == 0, r.stderr
    assert _printed(r) == _REAL_SECRET


def test_demo_users_disabled_by_default() -> None:
    """Demo credentials are published in this repo — they must not be live by default."""
    r = _run(
        "import core.security as s; print(len(s.DEMO_USERS))",
        JWT_SECRET=_REAL_SECRET,
    )
    assert r.returncode == 0, r.stderr
    assert _printed(r) == "0"


def test_demo_users_require_explicit_opt_in() -> None:
    r = _run(
        "import core.security as s; print('ciso@astralabs.com' in s.DEMO_USERS)",
        JWT_SECRET=_REAL_SECRET,
        CORTEX_ENABLE_DEMO_USERS="1",
    )
    assert r.returncode == 0, r.stderr
    assert _printed(r) == "True"


def test_production_rejects_demo_user_opt_in() -> None:
    r = _run(
        "import core.security as s; print(len(s.DEMO_USERS))",
        JWT_SECRET=_REAL_SECRET,
        CORTEX_ENVIRONMENT="production",
        CORTEX_ENABLE_DEMO_USERS="1",
        CORTEX_TESTING="1",
    )
    assert r.returncode == 0, r.stderr
    assert _printed(r) == "0"


def test_production_rejects_legacy_demo_password() -> None:
    r = _run(
        "import api.auth as a; print(repr(a._LEGACY_DEMO_PASSWORD))",
        JWT_SECRET=_REAL_SECRET,
        CORTEX_ENVIRONMENT="production",
        CORTEX_LEGACY_DEMO_PASSWORD="published-password",
    )
    assert r.returncode == 0, r.stderr
    assert _printed(r) == "''"


def test_static_token_bypass_environment_has_no_effect() -> None:
    r = _run(
        """
import asyncio
from unittest.mock import AsyncMock
from fastapi import HTTPException
from core.security import decode_access_token_async

async def main():
    try:
        await decode_access_token_async(AsyncMock(), 'old-static-bypass')
    except HTTPException as exc:
        print(exc.status_code)

asyncio.run(main())
""",
        JWT_SECRET=_REAL_SECRET,
        CORTEX_ALLOW_TOKEN_BYPASS="1",
        CORTEX_TOKEN_BYPASS_VALUE="old-static-bypass",
    )
    assert r.returncode == 0, r.stderr
    assert _printed(r) == "401"


def test_pyjwt_access_token_is_hs256_and_decodes() -> None:
    r = _run(
        """
import asyncio
import jwt
import core.security as s
from unittest.mock import AsyncMock

token = s.create_access_token(
    {"sub": "user-1", "org_id": "org-1", "is_demo": True},
    expires_minutes=1,
)
claims = asyncio.run(s.decode_access_token_async(AsyncMock(), token))
print(jwt.get_unverified_header(token)["alg"], claims["sub"])
""",
        JWT_SECRET=_REAL_SECRET,
    )
    assert r.returncode == 0, r.stderr
    assert _printed(r) == "HS256 user-1"


def test_pyjwt_expired_and_non_hs256_tokens_keep_invalid_token_response() -> None:
    r = _run(
        """
import asyncio
import jwt
import core.security as s
from fastapi import HTTPException
from unittest.mock import AsyncMock

async def rejected(token):
    try:
        await s.decode_access_token_async(AsyncMock(), token)
    except HTTPException as exc:
        return exc.status_code, exc.detail

expired = s.create_access_token(
    {"sub": "user-1", "org_id": "org-1", "is_demo": True},
    expires_minutes=-1,
)
wrong_algorithm = jwt.encode(
    {"sub": "user-1", "org_id": "org-1", "is_demo": True},
    s.SECRET_KEY,
    algorithm="HS384",
)
print(asyncio.run(rejected(expired)), asyncio.run(rejected(wrong_algorithm)))
""",
        JWT_SECRET=_REAL_SECRET,
    )
    assert r.returncode == 0, r.stderr
    expected = "(401, 'Invalid or expired token')"
    assert _printed(r) == f"{expected} {expected}"
