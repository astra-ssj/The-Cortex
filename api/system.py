# api/system.py — System and ZTAIP status endpoints.

from __future__ import annotations

import asyncio

from typing import Any

import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from api.errors import json_error
from core.agents.model import agent_provider_status
from core.audit_fabric import audit_fabric
from db.session import database_ready
from core.circuit_breaker import circuit_breakers_count
from core.human_review import human_review_pending_total_async
from core.llm import llm_platform_status
from core.security import get_current_user

from api.schemas import AgentProviderStatus, AuditFabricStatus, ZTAIPStatus

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


@router.get("/system/llm-providers")
async def get_llm_providers(
    _current_user: dict[str, Any] = Depends(get_current_user),
) -> dict:
    """Configured LLM provider chain (Anthropic, OpenAI, stub) — no secrets."""
    return llm_platform_status()


@router.get("/system/agent-status", response_model=AgentProviderStatus)
async def get_agent_status(
    _current_user: dict[str, Any] = Depends(get_current_user),
) -> AgentProviderStatus:
    """Authenticated Learning Loop provider snapshot. Not on public ztaip-status."""
    return AgentProviderStatus.model_validate(agent_provider_status())


@router.get("/system/ztaip-status", response_model=ZTAIPStatus)
async def get_ztaip_status(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> ZTAIPStatus:
    """Return ZTAIP status from audit fabric, circuit breakers, human review queue, sovereignty broker, agent certs."""
    await asyncio.sleep(0)
    org_id = str(current_user.get("org_id") or "").strip()
    return ZTAIPStatus(
        audit_fabric=AuditFabricStatus(
            total_events=await audit_fabric.total_events_async(org_id),
            last_event_at=await audit_fabric.last_event_at_async(org_id),
        ),
        circuit_breakers_count=circuit_breakers_count(),
        human_review_queue_count=await human_review_pending_total_async(org_id),
        sovereignty_broker=SOVEREIGNTY_BROKER_STATUS,
        agent_certificates_count=AGENT_CERTIFICATES_COUNT,
    )
