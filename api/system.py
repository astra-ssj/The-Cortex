# api/system.py — System and ZTAIP status endpoints.

from __future__ import annotations

import structlog
from fastapi import APIRouter

from core.audit_fabric import audit_fabric
from core.circuit_breaker import circuit_breakers_count
from core.human_review import human_review_queue_count

from api.schemas import AuditFabricStatus, ZTAIPStatus

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["system"])

# Sovereignty broker and agent certs: placeholder counts (read from real brokers when available).
SOVEREIGNTY_BROKER_STATUS = "active"
AGENT_CERTIFICATES_COUNT = 0


@router.get("/system/ready", response_model=dict)
async def get_system_ready() -> dict[str, str]:
    """Readiness probe for Kubernetes / load balancers (same semantics as root /ready)."""
    return {"status": "ready"}


@router.get("/system/ztaip-status", response_model=ZTAIPStatus)
async def get_ztaip_status() -> ZTAIPStatus:
    """Return ZTAIP status from audit fabric, circuit breakers, human review queue, sovereignty broker, agent certs."""
    return ZTAIPStatus(
        audit_fabric=AuditFabricStatus(
            total_events=audit_fabric.total_events(),
            last_event_at=audit_fabric.last_event_at(),
        ),
        circuit_breakers_count=circuit_breakers_count(),
        human_review_queue_count=human_review_queue_count(),
        sovereignty_broker=SOVEREIGNTY_BROKER_STATUS,
        agent_certificates_count=AGENT_CERTIFICATES_COUNT,
    )
