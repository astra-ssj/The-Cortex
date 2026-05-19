# api/system.py — System and ZTAIP status endpoints.

from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from api.errors import json_error
from core.audit_fabric import audit_fabric
from db.session import database_ready
from core.circuit_breaker import circuit_breakers_count
from core.human_review import human_review_pending_total_async

from api.schemas import AuditFabricStatus, ZTAIPStatus

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["system"])

# Sovereignty broker and agent certs: placeholder counts (read from real brokers when available).
SOVEREIGNTY_BROKER_STATUS = "active"
AGENT_CERTIFICATES_COUNT = 0


@router.get("/system/ready", response_model=None)
async def get_system_ready() -> dict[str, str] | JSONResponse:
    """Readiness probe: requires Postgres (load balancers should use this, not /health)."""
    if not await database_ready():
        return json_error(
            "SERVICE_UNAVAILABLE",
            "Database is not reachable",
            503,
        )
    return {"status": "ready", "database": "ok"}


@router.get("/system/ztaip-status", response_model=ZTAIPStatus)
async def get_ztaip_status() -> ZTAIPStatus:
    """Return ZTAIP status from audit fabric, circuit breakers, human review queue, sovereignty broker, agent certs."""
    await asyncio.sleep(0)
    return ZTAIPStatus(
        audit_fabric=AuditFabricStatus(
            total_events=await audit_fabric.total_events_async(),
            last_event_at=await audit_fabric.last_event_at_async(),
        ),
        circuit_breakers_count=circuit_breakers_count(),
        human_review_queue_count=await human_review_pending_total_async(),
        sovereignty_broker=SOVEREIGNTY_BROKER_STATUS,
        agent_certificates_count=AGENT_CERTIFICATES_COUNT,
    )
