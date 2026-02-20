# core/circuit_breaker.py — Circuit breakers for LLM calls. Instantiate at module level per .cursorrules.

from __future__ import annotations

from enum import Enum
from typing import Any, Callable, TypeVar

import structlog

logger = structlog.get_logger()

T = TypeVar("T")


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Simple circuit breaker. Tracks state for ZTAIP status; real calls go through execute()."""

    def __init__(self, name: str, failure_threshold: int = 5) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self._state = CircuitState.CLOSED
        self._failures = 0

    @property
    def state(self) -> CircuitState:
        return self._state

    def record_success(self) -> None:
        self._state = CircuitState.CLOSED
        self._failures = 0

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.failure_threshold:
            self._state = CircuitState.OPEN

    async def execute(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        if self._state == CircuitState.OPEN:
            raise RuntimeError(f"Circuit breaker {self.name} is open")
        try:
            result = await fn(*args, **kwargs)
            self.record_success()
            return result
        except Exception as e:
            self.record_failure()
            raise e


# Module-level registry of breakers (count for ZTAIP status).
_breakers: list[CircuitBreaker] = []


def register_circuit_breaker(breaker: CircuitBreaker) -> None:
    _breakers.append(breaker)


def circuit_breakers_count() -> int:
    return len(_breakers)


# Default breakers for assessment LLM and any other LLM calls.
_assessment_breaker = CircuitBreaker("assessment_llm", failure_threshold=5)
register_circuit_breaker(_assessment_breaker)

# Singleton list for "read real state" — API returns count.
circuit_breakers = _breakers
