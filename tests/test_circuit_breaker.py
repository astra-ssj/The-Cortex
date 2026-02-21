# tests/test_circuit_breaker.py — CircuitBreaker state, execute, registry.

from __future__ import annotations

import asyncio

import pytest

from core.circuit_breaker import (
    CircuitBreaker,
    CircuitState,
    circuit_breakers_count,
    register_circuit_breaker,
)


def test_circuit_breaker_initial_state() -> None:
    """CircuitBreaker starts CLOSED."""
    cb = CircuitBreaker("test", failure_threshold=3)
    assert cb.state == CircuitState.CLOSED
    assert cb.name == "test"


def test_circuit_breaker_record_success_resets_failures() -> None:
    """record_success sets state to CLOSED and resets failure count."""
    cb = CircuitBreaker("test", failure_threshold=2)
    cb.record_failure()
    cb.record_failure()
    assert cb.state == CircuitState.OPEN
    cb.record_success()
    assert cb.state == CircuitState.CLOSED


def test_circuit_breaker_opens_after_threshold() -> None:
    """record_failure opens circuit after failure_threshold."""
    cb = CircuitBreaker("test", failure_threshold=3)
    assert cb.state == CircuitState.CLOSED
    cb.record_failure()
    cb.record_failure()
    assert cb.state == CircuitState.CLOSED
    cb.record_failure()
    assert cb.state == CircuitState.OPEN


def test_circuit_breaker_execute_success() -> None:
    """execute runs fn and record_success on success."""
    cb = CircuitBreaker("test", failure_threshold=5)

    async def ok() -> str:
        return "ok"

    result = asyncio.run(cb.execute(ok))
    assert result == "ok"
    assert cb.state == CircuitState.CLOSED


def test_circuit_breaker_execute_failure_records_failure() -> None:
    """execute record_failure on exception and re-raises."""
    cb = CircuitBreaker("test", failure_threshold=2)

    async def fail() -> None:
        raise ValueError("fail")

    with pytest.raises(ValueError, match="fail"):
        asyncio.run(cb.execute(fail))
    assert cb.state == CircuitState.CLOSED
    with pytest.raises(ValueError, match="fail"):
        asyncio.run(cb.execute(fail))
    assert cb.state == CircuitState.OPEN


def test_circuit_breaker_open_raises_on_execute() -> None:
    """When OPEN, execute raises RuntimeError without calling fn."""
    cb = CircuitBreaker("test", failure_threshold=1)
    cb.record_failure()
    assert cb.state == CircuitState.OPEN

    called: list[bool] = []

    async def would_run() -> None:
        called.append(True)

    with pytest.raises(RuntimeError, match="Circuit breaker test is open"):
        asyncio.run(cb.execute(would_run))
    assert called == []


def test_register_circuit_breaker_increases_count() -> None:
    """register_circuit_breaker adds to registry; circuit_breakers_count reflects it."""
    before = circuit_breakers_count()
    extra = CircuitBreaker("extra_test_breaker", failure_threshold=1)
    register_circuit_breaker(extra)
    assert circuit_breakers_count() == before + 1
