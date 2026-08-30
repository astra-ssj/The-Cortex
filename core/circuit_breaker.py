# core/circuit_breaker.py — Circuit breakers for LLM calls. Instantiate at module level per .cursorrules.

from __future__ import annotations

import asyncio
import os
import time
from enum import Enum
from typing import Any, Callable, TypeVar

import structlog
from sqlalchemy import text

logger = structlog.get_logger()

T = TypeVar("T")


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Persisted circuit breaker with cooldown and a single HALF_OPEN probe."""

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        cooldown_seconds: float | None = None,
        failure_predicate: Callable[[Exception], bool] | None = None,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = max(
            0.0,
            cooldown_seconds
            if cooldown_seconds is not None
            else float(os.getenv("CORTEX_CIRCUIT_BREAKER_COOLDOWN_SECONDS", "30")),
        )
        self._failure_predicate = failure_predicate or (lambda _exc: True)
        self._state = CircuitState.CLOSED
        self._failures = 0
        self._opened_at: float | None = None
        self._state_lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        return self._state

    def apply_persisted_state(self, state: CircuitState, failures: int) -> None:
        """Hydrate legacy state columns; a crashed HALF_OPEN probe recovers as OPEN."""
        self._state = CircuitState.OPEN if state == CircuitState.HALF_OPEN else state
        self._failures = failures
        self._opened_at = time.monotonic() if self._state == CircuitState.OPEN else None

    def record_success(self) -> None:
        self._state = CircuitState.CLOSED
        self._failures = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._failures += 1
        if self._state == CircuitState.HALF_OPEN or self._failures >= self.failure_threshold:
            self._state = CircuitState.OPEN
            self._opened_at = time.monotonic()

    async def _persist_state_if_ready(self) -> None:
        from db.session import database_ready, engine

        if not await database_ready():
            return
        try:
            async with engine.begin() as conn:
                await conn.execute(
                    text(
                        """
                        INSERT INTO circuit_breaker_state (name, state, failures, updated_at)
                        VALUES (:name, :state, :failures, now())
                        ON CONFLICT (name) DO UPDATE SET
                            state = EXCLUDED.state,
                            failures = EXCLUDED.failures,
                            updated_at = now()
                        """
                    ),
                    {
                        "name": self.name,
                        "state": self._state.value,
                        "failures": self._failures,
                    },
                )
        except Exception as e:
            logger.warning(
                "circuit_breaker_persist_failed",
                breaker=self.name,
                error=str(e),
            )

    async def execute(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        is_probe = False
        async with self._state_lock:
            if self._state == CircuitState.OPEN:
                opened_at = self._opened_at if self._opened_at is not None else time.monotonic()
                if time.monotonic() - opened_at < self.cooldown_seconds:
                    raise RuntimeError(f"Circuit breaker {self.name} is open")
                self._state = CircuitState.HALF_OPEN
                is_probe = True
            elif self._state == CircuitState.HALF_OPEN:
                raise RuntimeError(f"Circuit breaker {self.name} is open")
        if is_probe:
            # A persisted HALF_OPEN state is loaded as OPEN, preventing multiple
            # workers from treating an interrupted probe as a healthy circuit.
            await self._persist_state_if_ready()
        try:
            result = await fn(*args, **kwargs)
            async with self._state_lock:
                self.record_success()
            await self._persist_state_if_ready()
            return result
        except Exception as e:
            async with self._state_lock:
                if self._failure_predicate(e):
                    self.record_failure()
                elif is_probe:
                    # Caller validation says nothing about provider health. Keep
                    # the circuit open and permit a fresh probe after cooldown.
                    self._state = CircuitState.OPEN
                    self._opened_at = time.monotonic()
            await self._persist_state_if_ready()
            raise


# Module-level registry of breakers (count for ZTAIP status).
_breakers: list[CircuitBreaker] = []


def register_circuit_breaker(breaker: CircuitBreaker) -> None:
    _breakers.append(breaker)


def circuit_breakers_count() -> int:
    return len(_breakers)


async def load_circuit_breaker_states_from_db() -> None:
    """Restore breaker failure counts and open state after process restart."""
    from db.session import database_ready, engine

    if not await database_ready():
        return
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT name, state, failures FROM circuit_breaker_state"))
            rows = result.mappings().all()
    except Exception as e:
        logger.warning("circuit_breaker_load_failed", error=str(e))
        return
    by_name = {str(r["name"]): r for r in rows}
    for b in _breakers:
        row = by_name.get(b.name)
        if row is None:
            continue
        try:
            st = CircuitState(str(row["state"]))
        except ValueError:
            continue
        failures = int(row["failures"])
        b.apply_persisted_state(st, failures)


# Default breakers for assessment LLM and any other LLM calls.
_assessment_breaker = CircuitBreaker("assessment_llm", failure_threshold=5)
register_circuit_breaker(_assessment_breaker)


def get_assessment_breaker() -> CircuitBreaker:
    """Module-level assessment LLM breaker (ZTAIP: no naked LLM calls)."""
    return _assessment_breaker

# Singleton list for "read real state" — API returns count.
circuit_breakers = _breakers
