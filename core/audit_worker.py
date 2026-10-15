# core/audit_worker.py — High-throughput resilient Redis Stream audit worker.
#
# Constraints & Specifications:
#   - Libraries: asyncio, redis.asyncio, asyncpg, hashlib
#   - CRITICAL: asyncpg pool MUST be initialized with statement_cache_size=0 and prepared_statement_cache_size=0
#               for PgBouncer transaction pooling compatibility.
#   - Phase 1: Zombie Recovery via XAUTOCLAIM (min_idle_time > 60,000ms).
#   - Phase 2: Normal Fetch via XREADGROUP (block <= 2000ms, count <= 100).
#   - Phase 3: DB Transaction:
#       * Group by tenant_id in memory.
#       * SELECT last_hash, current_sequence FROM tenant_audit_tail WHERE tenant_id = $1 FOR UPDATE.
#       * Calculate SHA-256: hash(tenant_id + sequence + user_id + action_data + prev_hash).
#       * asyncpg.executemany to insert into audit_log.
#       * UPSERT new tail into tenant_audit_tail.
#   - Phase 4: Cleanup via XACK and XTRIM (approximate=True).
#   - Poison Pill (DLQ): Wrap DB transaction in try/except catching asyncpg.exceptions.DataError.
#       * Route raw messages to Redis stream `audit_dlq`.
#       * XACK the main stream to prevent deadlocks.
#       * Log a critical error without crashing the worker.

from __future__ import annotations

import asyncio
from collections import defaultdict
import hashlib
import os
from typing import Any, Dict, List, Optional, Tuple
import uuid

import asyncpg
import asyncpg.exceptions
import redis.asyncio as aioredis
import redis.exceptions
import structlog

logger = structlog.get_logger()


async def create_pg_pool(
    dsn: Optional[str] = None,
    *,
    statement_cache_size: int = 0,
    prepared_statement_cache_size: int = 0,
    min_size: int = 5,
    max_size: int = 20,
    **kwargs: Any,
) -> asyncpg.Pool:
    """Initialize an asyncpg connection pool with statement caching disabled.

    Crucial for PgBouncer transaction pooling mode where prepared statements
    cannot be pinned to backend connections across transactions.
    """
    if dsn is None:
        dsn = os.getenv("DATABASE_URL", "postgresql://cortex:cortex-dev@localhost:5432/cortex")

    # In case DATABASE_URL uses SQLAlchemy async prefix (e.g. postgresql+asyncpg://)
    if dsn.startswith("postgresql+asyncpg://"):
        dsn = dsn.replace("postgresql+asyncpg://", "postgresql://", 1)

    pool_kwargs = {
        "min_size": min_size,
        "max_size": max_size,
        "statement_cache_size": statement_cache_size,
        **kwargs,
    }

    # Pass prepared_statement_cache_size if accepted by asyncpg version
    try:
        return await asyncpg.create_pool(
            dsn,
            prepared_statement_cache_size=prepared_statement_cache_size,
            **pool_kwargs,
        )
    except TypeError:
        return await asyncpg.create_pool(
            dsn,
            **pool_kwargs,
        )


def compute_audit_hash(
    tenant_id: str,
    sequence: int,
    user_id: str,
    action_data: str,
    prev_hash: str,
) -> str:
    """Calculate sequential SHA-256 hash according to the specification:

    hash(tenant_id + sequence + user_id + action_data + prev_hash)
    """
    preimage = f"{tenant_id}{sequence}{user_id}{action_data}{prev_hash}"
    return hashlib.sha256(preimage.encode("utf-8")).hexdigest()


class AuditStreamWorker:
    """Resilient consumer worker for partitioned Redis audit streams."""

    def __init__(
        self,
        stream_key: str,
        group_name: str,
        consumer_name: str,
        redis: aioredis.Redis,
        db_pool: asyncpg.Pool,
        dlq_stream_key: str = "audit_dlq",
        stream_maxlen: int = 100000,
    ) -> None:
        self.stream_key = stream_key
        self.group_name = group_name
        self.consumer_name = consumer_name
        self.redis = redis
        self.db_pool = db_pool
        self.dlq_stream_key = dlq_stream_key
        self.stream_maxlen = stream_maxlen

    async def ensure_consumer_group(self) -> None:
        """Create the consumer group idempotently."""
        try:
            await self.redis.xgroup_create(
                self.stream_key,
                self.group_name,
                id="0",
                mkstream=True,
            )
            logger.info("consumer_group_created", stream=self.stream_key, group=self.group_name)
        except redis.exceptions.ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    async def fetch_zombie_messages(
        self,
        min_idle_time: int = 60000,
        count: int = 100,
    ) -> List[Tuple[str, Dict[str, str]]]:
        """Phase 1: Zombie Recovery.

        Autoclaim messages stuck pending for > 60,000ms.
        """
        try:
            res = await self.redis.xautoclaim(
                self.stream_key,
                self.group_name,
                self.consumer_name,
                min_idle_time=min_idle_time,
                start_id="0-0",
                count=count,
            )
            # xautoclaim returns [next_start_id, messages, (deleted_ids)]
            if res and len(res) > 1 and res[1]:
                return res[1]
        except Exception as exc:
            logger.warning("xautoclaim_failed", stream=self.stream_key, error=str(exc))
        return []

    async def fetch_normal_messages(
        self,
        block_ms: int = 2000,
        count: int = 100,
    ) -> List[Tuple[str, Dict[str, str]]]:
        """Phase 2: Normal Fetch.

        Read up to 100 new messages, blocking for up to 2000ms.
        """
        try:
            read_res = await self.redis.xreadgroup(
                groupname=self.group_name,
                consumername=self.consumer_name,
                streams={self.stream_key: ">"},
                count=count,
                block=block_ms,
            )
            # read_res structure: [[stream_key, [(msg_id, fields), ...]]]
            if read_res:
                for s_key, s_msgs in read_res:
                    if s_key == self.stream_key:
                        return s_msgs
        except Exception as exc:
            logger.error("xreadgroup_failed", stream=self.stream_key, error=str(exc))
        return []

    async def _handle_poison_pill(
        self,
        messages: List[Tuple[str, Dict[str, str]]],
        exc: Exception,
    ) -> None:
        """Route offending batch to DLQ and unblock queue."""
        logger.critical(
            "poison_pill_detected_routed_to_dlq",
            stream=self.stream_key,
            error=str(exc),
            message_count=len(messages),
        )

        for msg_id, fields in messages:
            dlq_payload = {
                "original_msg_id": str(msg_id),
                "original_stream": self.stream_key,
                "dlq_reason": str(exc),
                **{k: str(v) for k, v in fields.items()},
            }
            await self.redis.xadd(
                self.dlq_stream_key,
                dlq_payload,
                maxlen=self.stream_maxlen,
                approximate=True,
            )

        # XACK the messages from the main stream to prevent continuous crashing
        msg_ids = [msg_id for msg_id, _ in messages]
        if msg_ids:
            await self.redis.xack(self.stream_key, self.group_name, *msg_ids)

    async def process_batch(self, messages: List[Tuple[str, Dict[str, str]]]) -> int:
        """Process messages: Phase 3 (DB Transaction) + Phase 4 (Cleanup) or DLQ routing."""
        if not messages:
            return 0

        # Group messages by tenant_id in memory
        tenant_groups: Dict[str, List[Tuple[str, Dict[str, str]]]] = defaultdict(list)
        for msg_id, fields in messages:
            t_id = str(fields.get("tenant_id", "default-tenant"))
            tenant_groups[t_id].append((msg_id, fields))

        all_audit_rows: List[Tuple[Any, ...]] = []
        tail_updates: List[Tuple[str, str, int]] = []

        try:
            async with self.db_pool.acquire() as conn:
                async with conn.transaction():
                    for tenant_id, tenant_msgs in tenant_groups.items():
                        # Acquire row-level lock on the tenant's current tail
                        row = await conn.fetchrow(
                            "SELECT last_hash, current_sequence FROM tenant_audit_tail WHERE tenant_id = $1 FOR UPDATE",
                            tenant_id,
                        )

                        prev_hash = row["last_hash"] if row and row["last_hash"] is not None else ""
                        curr_sequence = int(row["current_sequence"]) if row and row["current_sequence"] is not None else 0

                        for msg_id, fields in tenant_msgs:
                            curr_sequence += 1
                            user_id = str(fields.get("user_id", ""))
                            action_data_str = str(fields.get("action_data", "{}"))

                            # Cryptographic SHA-256 calculation
                            calculated_hash = compute_audit_hash(
                                tenant_id=tenant_id,
                                sequence=curr_sequence,
                                user_id=user_id,
                                action_data=action_data_str,
                                prev_hash=prev_hash,
                            )

                            row_id = uuid.uuid4()
                            all_audit_rows.append(
                                (
                                    row_id,
                                    tenant_id,
                                    user_id,
                                    action_data_str,
                                    curr_sequence,
                                    calculated_hash,
                                    prev_hash,
                                )
                            )

                            # Advance hash pointer in memory
                            prev_hash = calculated_hash

                        tail_updates.append((tenant_id, prev_hash, curr_sequence))

                    # Bulk-insert into audit_log via executemany
                    # Supports full unified schema with fallback for minimal schema
                    try:
                        await conn.executemany(
                            """
                            INSERT INTO audit_log (
                                id, tenant_id, user_id, action_data, sequence, hash, prev_hash,
                                org_id, actor, action, payload
                            )
                            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $2, $3, 'audit_decision', $4::jsonb)
                            """,
                            all_audit_rows,
                        )
                    except (asyncpg.exceptions.UndefinedColumnError, asyncpg.exceptions.PostgresSyntaxError):
                        await conn.executemany(
                            """
                            INSERT INTO audit_log (
                                id, tenant_id, user_id, action_data, sequence, hash, prev_hash
                            )
                            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
                            """,
                            all_audit_rows,
                        )

                    # UPSERT new tails into tenant_audit_tail
                    await conn.executemany(
                        """
                        INSERT INTO tenant_audit_tail (tenant_id, last_hash, current_sequence, updated_at)
                        VALUES ($1, $2, $3, NOW())
                        ON CONFLICT (tenant_id)
                        DO UPDATE SET
                            last_hash = EXCLUDED.last_hash,
                            current_sequence = EXCLUDED.current_sequence,
                            updated_at = NOW()
                        """,
                        tail_updates,
                    )

        except asyncpg.exceptions.DataError as exc:
            # Poison Pill Handling (DLQ): Catch DataError, route to audit_dlq, XACK, log critical
            await self._handle_poison_pill(messages, exc)
            return len(messages)

        # Phase 4 (Cleanup): XACK processed messages
        msg_ids = [msg_id for msg_id, _ in messages]
        if msg_ids:
            await self.redis.xack(self.stream_key, self.group_name, *msg_ids)

        # Phase 4 (Cleanup): XTRIM to prevent stream memory leaks
        await self.redis.xtrim(self.stream_key, maxlen=self.stream_maxlen, approximate=True)

        return len(messages)

    async def run_single_iteration(self) -> int:
        """Run a single cycle of Phase 1 or Phase 2."""
        # 1. Phase 1: Zombie Recovery (Pending > 60,000ms)
        zombie_msgs = await self.fetch_zombie_messages(min_idle_time=60000, count=100)
        if zombie_msgs:
            logger.info("recovering_zombie_messages", count=len(zombie_msgs), stream=self.stream_key)
            return await self.process_batch(zombie_msgs)

        # 2. Phase 2: Normal Fetch (Block up to 2000ms, count=100)
        normal_msgs = await self.fetch_normal_messages(block_ms=2000, count=100)
        if normal_msgs:
            return await self.process_batch(normal_msgs)

        return 0

    async def run_loop(
        self,
        stop_event: Optional[asyncio.Event] = None,
        max_iterations: Optional[int] = None,
    ) -> None:
        """Main resilient worker loop."""
        await self.ensure_consumer_group()
        iterations = 0

        logger.info(
            "audit_worker_started",
            stream=self.stream_key,
            group=self.group_name,
            consumer=self.consumer_name,
        )

        while stop_event is None or not stop_event.is_set():
            try:
                await self.run_single_iteration()
            except asyncio.CancelledError:
                logger.info("audit_worker_cancelled", stream=self.stream_key)
                break
            except Exception as exc:
                logger.error("worker_loop_error", stream=self.stream_key, error=str(exc))
                await asyncio.sleep(1.0)

            iterations += 1
            if max_iterations is not None and iterations >= max_iterations:
                break


async def run_audit_worker(
    stream_key: str,
    group_name: str,
    consumer_name: str,
    redis: aioredis.Redis,
    db_pool: asyncpg.Pool,
    stop_event: Optional[asyncio.Event] = None,
    max_iterations: Optional[int] = None,
) -> None:
    """Convenience entrypoint to execute the audit stream worker."""
    worker = AuditStreamWorker(
        stream_key=stream_key,
        group_name=group_name,
        consumer_name=consumer_name,
        redis=redis,
        db_pool=db_pool,
    )
    await worker.run_loop(stop_event=stop_event, max_iterations=max_iterations)
