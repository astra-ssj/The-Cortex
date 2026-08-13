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
