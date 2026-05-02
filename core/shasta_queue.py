# core/shasta_queue.py — Optional Redis queue for durable Shasta scan jobs (multi-replica API).

from __future__ import annotations

import json
import os
from typing import Any

import structlog

logger = structlog.get_logger()

QUEUE_KEY = "cortex:shasta:jobs"

_redis_client: Any = None


def redis_url_configured() -> bool:
    return bool((os.getenv("SHASTA_REDIS_URL") or os.getenv("REDIS_URL") or "").strip())


def _redis_url() -> str:
    url = (os.getenv("SHASTA_REDIS_URL") or os.getenv("REDIS_URL") or "").strip()
    if not url:
        raise RuntimeError("REDIS_URL / SHASTA_REDIS_URL not set")
    return url


async def enqueue_shasta_scan_job(*, run_id: str, org_id: str, cloud: str) -> None:
    """LPUSH JSON payload for ``workers/shasta_worker.py`` (BRPOP consumer)."""
    try:
        import redis.asyncio as redis  # type: ignore[import-untyped]
    except ImportError as e:
        raise RuntimeError(
            'Redis client missing — install optional extra: pip install -e ".[redis-queue]"'
        ) from e

    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(_redis_url(), decode_responses=True)

    payload = json.dumps({"run_id": run_id, "org_id": org_id, "cloud": cloud})
    await _redis_client.lpush(QUEUE_KEY, payload)
    logger.info("shasta_job_enqueued_redis", run_id=run_id, org_id=org_id, cloud=cloud)
