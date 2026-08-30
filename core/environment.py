"""Runtime environment guards for security-sensitive development features."""

from __future__ import annotations

import os

_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
_PRODUCTION_VALUES = frozenset({"prod", "production"})


def environment_name() -> str:
    """Resolve the deployment environment from supported operator conventions."""
    for key in ("CORTEX_ENVIRONMENT", "CORTEX_ENV", "APP_ENV", "ENVIRONMENT"):
        value = os.getenv(key, "").strip().lower()
        if value:
            return value
    return "local"


def is_production_environment() -> bool:
    return environment_name() in _PRODUCTION_VALUES


def non_production_flag_enabled(name: str, *, allow_testing: bool = False) -> bool:
    """Enable an unsafe local/test feature only when production is impossible."""
    if is_production_environment():
        return False
    if allow_testing and os.getenv("CORTEX_TESTING", "").strip().lower() in _TRUE_VALUES:
        return True
    return os.getenv(name, "").strip().lower() in _TRUE_VALUES
