# tests/test_audit_worker.py — Tests for resilient Redis Streams audit worker.

from __future__ import annotations

import asyncio
import hashlib
import json
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import asyncpg
import asyncpg.exceptions
import pytest
import redis.asyncio as aioredis

from core.audit_worker import (
    AuditStreamWorker,
    compute_audit_hash,
    create_pg_pool,
    run_audit_worker,
)


class MockTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return None


class MockConnectionContext:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return None


@pytest.fixture
def mock_redis() -> AsyncMock:
    redis = AsyncMock()
    redis.xgroup_create = AsyncMock(return_value="OK")
    redis.xautoclaim = AsyncMock(return_value=["0-0", [], []])
    redis.xreadgroup = AsyncMock(return_value=[])
    redis.xack = AsyncMock(return_value=1)
    redis.xtrim = AsyncMock(return_value=0)
    redis.xadd = AsyncMock(return_value="1729000000000-0")
    return redis


@pytest.fixture
def mock_conn() -> AsyncMock:
    conn = AsyncMock()
    conn.transaction = MagicMock(return_value=MockTransaction())
    conn.fetchrow = AsyncMock(return_value=None)
    conn.executemany = AsyncMock(return_value="INSERT 0 1")
    return conn


@pytest.fixture
def mock_pool(mock_conn: AsyncMock) -> MagicMock:
    pool = MagicMock()
    pool.acquire = MagicMock(return_value=MockConnectionContext(mock_conn))
    return pool


def test_compute_audit_hash_formula():
    """Verify cryptographic SHA-256 matches specification: hash(tenant_id + sequence + user_id + action_data + prev_hash)."""
    tenant_id = "tenant-xyz"
    sequence = 42
    user_id = "user-abc"
    action_data = '{"action":"login","ip":"192.168.1.1"}'
    prev_hash = "deadbeef" * 8

    expected_preimage = f"{tenant_id}{sequence}{user_id}{action_data}{prev_hash}"
    expected_hash = hashlib.sha256(expected_preimage.encode("utf-8")).hexdigest()

    actual_hash = compute_audit_hash(
        tenant_id=tenant_id,
        sequence=sequence,
        user_id=user_id,
        action_data=action_data,
        prev_hash=prev_hash,
    )

    assert actual_hash == expected_hash


@pytest.mark.asyncio
async def test_create_pg_pool_pgbouncer_parameters():
    """Verify CRITICAL constraint: statement_cache_size=0 and prepared_statement_cache_size=0."""
    with patch("asyncpg.create_pool", new_callable=AsyncMock) as mock_create_pool:
        mock_create_pool.return_value = MagicMock(spec=asyncpg.Pool)

        pool = await create_pg_pool(
            "postgresql://localhost/test",
            statement_cache_size=0,
            prepared_statement_cache_size=0,
        )

        assert pool is not None
        mock_create_pool.assert_awaited_once()
        _, kwargs = mock_create_pool.call_args
        assert kwargs.get("statement_cache_size") == 0


@pytest.mark.asyncio
async def test_phase_1_zombie_recovery(mock_redis: AsyncMock, mock_pool: MagicMock):
    """Phase 1: Worker uses XAUTOCLAIM for messages pending > 60,000ms and processes them first."""
    worker = AuditStreamWorker(
        stream_key="audit_stream:partition_0",
        group_name="audit_workers",
        consumer_name="worker_1",
        redis=mock_redis,
        db_pool=mock_pool,
    )

    # Simulate xautoclaim returning 1 recovered message
    stuck_msg = ("1700000000000-0", {"tenant_id": "t1", "user_id": "u1", "action_data": "{}"})
    mock_redis.xautoclaim.return_value = ["0-0", [stuck_msg], []]

    # Mock process_batch
    worker.process_batch = AsyncMock(return_value=1)

    processed_count = await worker.run_single_iteration()

    mock_redis.xautoclaim.assert_awaited_once_with(
        "audit_stream:partition_0",
        "audit_workers",
        "worker_1",
        min_idle_time=60000,
        start_id="0-0",
        count=100,
    )
    # process_batch was called with the claimed messages
    worker.process_batch.assert_awaited_once_with([stuck_msg])
    assert processed_count == 1
    # xreadgroup should NOT have been called because zombie messages were found
    mock_redis.xreadgroup.assert_not_awaited()


@pytest.mark.asyncio
async def test_phase_2_normal_fetch(mock_redis: AsyncMock, mock_pool: MagicMock):
    """Phase 2: When no zombie messages exist, worker calls XREADGROUP with block=2000ms and count=100."""
    worker = AuditStreamWorker(
        stream_key="audit_stream:partition_0",
        group_name="audit_workers",
        consumer_name="worker_1",
        redis=mock_redis,
        db_pool=mock_pool,
    )

    # Phase 1 returns empty
    mock_redis.xautoclaim.return_value = ["0-0", [], []]

    # Phase 2 returns 2 messages
    msg1 = ("1729000000001-0", {"tenant_id": "tenant-a", "user_id": "u1", "action_data": '{"k":"v1"}'})
    msg2 = ("1729000000002-0", {"tenant_id": "tenant-a", "user_id": "u2", "action_data": '{"k":"v2"}'})
    mock_redis.xreadgroup.return_value = [["audit_stream:partition_0", [msg1, msg2]]]

    worker.process_batch = AsyncMock(return_value=2)

    processed_count = await worker.run_single_iteration()

    mock_redis.xautoclaim.assert_awaited_once()
    mock_redis.xreadgroup.assert_awaited_once_with(
        groupname="audit_workers",
        consumername="worker_1",
        streams={"audit_stream:partition_0": ">"},
        count=100,
        block=2000,
    )
    worker.process_batch.assert_awaited_once_with([msg1, msg2])
    assert processed_count == 2


@pytest.mark.asyncio
async def test_phase_3_and_4_db_transaction_and_cleanup(
    mock_redis: AsyncMock,
    mock_pool: MagicMock,
    mock_conn: AsyncMock,
):
    """Phase 3 & 4: In-memory grouping, SELECT FOR UPDATE, SHA-256 chaining, executemany, UPSERT, XACK, and XTRIM."""
    # Existing tail in DB: sequence 10, hash 'initial_hash_10'
    mock_conn.fetchrow.return_value = {
        "last_hash": "initial_hash_10",
        "current_sequence": 10,
    }

    worker = AuditStreamWorker(
        stream_key="audit_stream:partition_0",
        group_name="audit_workers",
        consumer_name="worker_1",
        redis=mock_redis,
        db_pool=mock_pool,
    )

    t_id = "tenant-alpha"
    msg1 = ("1729000000001-0", {"tenant_id": t_id, "user_id": "u1", "action_data": '{"op":"create"}'})
    msg2 = ("1729000000002-0", {"tenant_id": t_id, "user_id": "u2", "action_data": '{"op":"update"}'})

    # Expected sequential hashes
    h1 = compute_audit_hash(t_id, 11, "u1", '{"op":"create"}', "initial_hash_10")
    h2 = compute_audit_hash(t_id, 12, "u2", '{"op":"update"}', h1)

    count = await worker.process_batch([msg1, msg2])

    assert count == 2

    # Verify SELECT FOR UPDATE was called for tenant-alpha
    mock_conn.fetchrow.assert_awaited_once_with(
        "SELECT last_hash, current_sequence FROM tenant_audit_tail WHERE tenant_id = $1 FOR UPDATE",
        t_id,
    )

    # Verify executemany for audit_log and tenant_audit_tail
    assert mock_conn.executemany.await_count == 2

    # Check audit_log insert arguments
    audit_call = mock_conn.executemany.call_args_list[0]
    audit_rows = audit_call[0][1]
    assert len(audit_rows) == 2
    # Verify sequence progression
    assert audit_rows[0][4] == 11
    assert audit_rows[0][5] == h1
    assert audit_rows[0][6] == "initial_hash_10"

    assert audit_rows[1][4] == 12
    assert audit_rows[1][5] == h2
    assert audit_rows[1][6] == h1

    # Check tenant_audit_tail upsert arguments
    tail_call = mock_conn.executemany.call_args_list[1]
    tail_rows = tail_call[0][1]
    assert len(tail_rows) == 1
    assert tail_rows[0] == (t_id, h2, 12)

    # Phase 4 Cleanup: XACK and XTRIM
    mock_redis.xack.assert_awaited_once_with(
        "audit_stream:partition_0",
        "audit_workers",
        "1729000000001-0",
        "1729000000002-0",
    )
    mock_redis.xtrim.assert_awaited_once_with(
        "audit_stream:partition_0",
        maxlen=100000,
        approximate=True,
    )


@pytest.mark.asyncio
async def test_poison_pill_handling_dlq(
    mock_redis: AsyncMock,
    mock_pool: MagicMock,
    mock_conn: AsyncMock,
):
    """Poison Pill: On asyncpg.exceptions.DataError, route to audit_dlq, XACK main stream, do NOT crash."""
    mock_conn.fetchrow.return_value = None
    # Simulate DB DataError (e.g. invalid string for uuid/jsonb column)
    mock_conn.executemany.side_effect = asyncpg.exceptions.DataError("invalid input syntax for type jsonb: 'BAD_SYNTAX'")

    worker = AuditStreamWorker(
        stream_key="audit_stream:partition_0",
        group_name="audit_workers",
        consumer_name="worker_1",
        redis=mock_redis,
        db_pool=mock_pool,
        dlq_stream_key="audit_dlq",
    )

    bad_msg = ("1729000099999-0", {"tenant_id": "t-bad", "user_id": "u-bad", "action_data": "BAD_SYNTAX"})

    # Must NOT raise exception
    processed = await worker.process_batch([bad_msg])
    assert processed == 1

    # Verify message was routed to DLQ stream
    mock_redis.xadd.assert_awaited_once()
    dlq_stream, dlq_payload = mock_redis.xadd.call_args[0]
    assert dlq_stream == "audit_dlq"
    assert dlq_payload["original_msg_id"] == "1729000099999-0"
    assert dlq_payload["original_stream"] == "audit_stream:partition_0"
    assert "invalid input syntax" in dlq_payload["dlq_reason"]

    # Verify main stream was XACKed to unblock the partition
    mock_redis.xack.assert_awaited_once_with(
        "audit_stream:partition_0",
        "audit_workers",
        "1729000099999-0",
    )


@pytest.mark.asyncio
async def test_worker_run_loop_termination(mock_redis: AsyncMock, mock_pool: MagicMock):
    """Verify run_loop executes and halts on stop_event or max_iterations."""
    worker = AuditStreamWorker(
        stream_key="audit_stream:partition_0",
        group_name="audit_group",
        consumer_name="c1",
        redis=mock_redis,
        db_pool=mock_pool,
    )

    worker.run_single_iteration = AsyncMock(return_value=0)

    # Run for exactly 3 iterations
    await worker.run_loop(max_iterations=3)

    assert worker.run_single_iteration.await_count == 3
    mock_redis.xgroup_create.assert_awaited_once_with(
        "audit_stream:partition_0",
        "audit_group",
        id="0",
        mkstream=True,
    )


@pytest.mark.asyncio
async def test_audit_worker_live_postgres_integration():
    """Verify live PostgreSQL transaction with SELECT FOR UPDATE, SHA-256 hash chaining, executemany, and tail upsert."""
    import os

    dsn = os.getenv("DATABASE_URL", "postgresql://cortex:cortex_ci_test@127.0.0.1:5434/cortex")
    if dsn.startswith("postgresql+asyncpg://"):
        dsn = dsn.replace("postgresql+asyncpg://", "postgresql://", 1)

    try:
        pool = await create_pg_pool(
            dsn,
            statement_cache_size=0,
            prepared_statement_cache_size=0,
            min_size=1,
            max_size=2,
        )
    except Exception:
        pytest.skip("Live PostgreSQL not reachable")

    mock_redis = AsyncMock()
    mock_redis.xack = AsyncMock(return_value=1)
    mock_redis.xtrim = AsyncMock(return_value=0)

    t_id = f"tenant-live-{uuid.uuid4().hex[:8]}"
    u_id = f"user-{uuid.uuid4().hex[:8]}"

    worker = AuditStreamWorker(
        stream_key="audit_stream:partition_0",
        group_name="audit_group",
        consumer_name="worker_test",
        redis=mock_redis,
        db_pool=pool,
    )

    msg1 = ("1729000000001-0", {"tenant_id": t_id, "user_id": u_id, "action_data": '{"action":"login"}'})
    msg2 = ("1729000000002-0", {"tenant_id": t_id, "user_id": u_id, "action_data": '{"action":"grant"}'})

    try:
        count = await worker.process_batch([msg1, msg2])
        assert count == 2

        # Verify database state
        async with pool.acquire() as conn:
            tail_row = await conn.fetchrow(
                "SELECT last_hash, current_sequence FROM tenant_audit_tail WHERE tenant_id = $1",
                t_id,
            )
            assert tail_row is not None
            assert tail_row["current_sequence"] == 2
            final_hash = tail_row["last_hash"]

            # Query audit_log
            audit_rows = await conn.fetch(
                "SELECT sequence, hash, prev_hash FROM audit_log WHERE tenant_id = $1 ORDER BY sequence ASC",
                t_id,
            )
            assert len(audit_rows) == 2
            assert audit_rows[0]["sequence"] == 1
            assert audit_rows[1]["sequence"] == 2
            assert audit_rows[1]["hash"] == final_hash
            assert audit_rows[1]["prev_hash"] == audit_rows[0]["hash"]

            # Cleanup test data in tenant_audit_tail (audit_log is append-only immutable)
            await conn.execute("DELETE FROM tenant_audit_tail WHERE tenant_id = $1", t_id)
    finally:
        await pool.close()

