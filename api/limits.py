# api/limits.py — shared SlowAPI limiter for auth and other sensitive routes.

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Pytest + shared TestClient exhaust 10/min on /auth/token — set CORTEX_DISABLE_RATE_LIMIT=1 in tests.
_rate_limits_enabled = os.getenv("CORTEX_DISABLE_RATE_LIMIT", "").lower() not in ("1", "true", "yes")
limiter = Limiter(key_func=get_remote_address, enabled=_rate_limits_enabled)
