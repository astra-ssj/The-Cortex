#!/usr/bin/env python3
"""Consume Shasta scan jobs from Redis (LPUSH / BRPOP).

Run with same ``PYTHONPATH`` and ``DATABASE_URL`` as the API. Requires optional ``redis-queue`` extra.

  export PYTHONPATH=".:services/compliance-engine"
  export REDIS_URL=redis://localhost:6379/0
  python workers/shasta_worker.py
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid

import structlog

logger = structlog.get_logger()

from core.shasta_queue import QUEUE_KEY  # noqa: E402


async def _consume_loop() -> None:
    try:
        import redis.asyncio as redis  # type: ignore[import-untyped]
    except ImportError as e:
        raise SystemExit(
            'Install Redis client: pip install -e ".[redis-queue]"'
        ) from e

    url = (os.getenv("SHASTA_REDIS_URL") or os.getenv("REDIS_URL") or "").strip()
    if not url:
        raise SystemExit("SHASTA_REDIS_URL or REDIS_URL is required")

    # Import after env is stable — pulls compliance-engine Shasta adapter path.
    from api.shasta_cloud import _run_shasta_scan_background

    r = redis.from_url(url, decode_responses=True)
    logger.info("shasta_worker_started", queue=QUEUE_KEY)

    while True:
        try:
            item = await r.brpop(QUEUE_KEY, timeout=30)
            if item is None:
                continue
            _, raw = item
            data = json.loads(raw)
            run_uuid = uuid.UUID(data["run_id"])
            org_id = str(data["org_id"])
            cloud = str(data["cloud"])
            if cloud not in ("aws", "azure"):
                logger.warning("shasta_worker_bad_cloud", payload=data)
                continue
            logger.info(
                "shasta_worker_job_start",
                run_id=str(run_uuid),
                org_id=org_id,
                cloud=cloud,
            )
            await _run_shasta_scan_background(run_uuid, org_id, cloud)  # type: ignore[arg-type]
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("shasta_worker_job_error")


def main() -> None:
    asyncio.run(_consume_loop())


if __name__ == "__main__":
    main()
