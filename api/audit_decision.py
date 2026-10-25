# api/audit_decision.py — Ultra-fast event ingestion router partitioned into Redis Streams.
#
# Constraints:
#   - Framework: FastAPI
#   - Redis Client: redis.asyncio (decode_responses=True)
#   - Hashing: mmh3 (MurmurHash3)
#   - Decoupled from Postgres: MUST NOT import SQLAlchemy or asyncpg.
#   - Catch Redis connection errors and return HTTP 503.

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional, Union
from uuid import UUID

import mmh3
import redis.asyncio as aioredis
from redis.exceptions import (
    ConnectionError as RedisConnectionError,
    RedisError,
    TimeoutError as RedisTimeoutError,
)
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

logger = structlog.get_logger()

_bearer_optional = HTTPBearer(auto_error=False)


def verify_audit_stream_caller(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_optional),
) -> Optional[dict[str, Any]]:
    """Enforce JWT bearer authentication when CORTEX_AUDIT_STREAM_REQUIRE_AUTH=1 or when a Bearer token is supplied.

    Remains 100% decoupled from SQLAlchemy/asyncpg by verifying HS256 JWT claims directly.
    When authenticated, prevents cross-tenant spoofing by requiring payload.tenant_id to match
    the caller's org_id (unless the caller holds an admin role).
    """
    require_auth = os.getenv("CORTEX_AUDIT_STREAM_REQUIRE_AUTH", "").lower() in ("1", "true", "yes")
    token: Optional[str] = credentials.credentials if credentials and credentials.credentials else None
    if not token:
        if require_auth:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required for audit decision stream",
            )
        return None

    import jwt
    from jwt.exceptions import InvalidTokenError

    secret = (
        os.getenv("JWT_SECRET")
        or os.getenv("CORTEX_SECRET_KEY")
        or "cortex-dev-jwt-signing-placeholder-not-for-production"
    )
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"])
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc
    return claims

# Connection pool for high-throughput async Redis operations.
_redis_pool: Optional[aioredis.ConnectionPool] = None
_redis_client: Optional[aioredis.Redis] = None


def get_redis_client() -> aioredis.Redis:
    """Return an async Redis client with decode_responses=True.

    Uses connection pooling to maximize throughput and minimize handshake overhead.
    Can be overridden via FastAPI dependency injection in tests:
        app.dependency_overrides[get_redis_client] = lambda: mock_redis
    """
    global _redis_pool, _redis_client
    if _redis_client is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        _redis_pool = aioredis.ConnectionPool.from_url(
            redis_url,
            decode_responses=True,
            max_connections=int(os.getenv("REDIS_MAX_CONNECTIONS", "50")),
        )
        _redis_client = aioredis.Redis(connection_pool=_redis_pool, decode_responses=True)
    return _redis_client


# Alias for dependency injection
get_redis = get_redis_client


class DecisionEventPayload(BaseModel):
    """Pydantic payload schema for audit decision events.

    Attributes:
        tenant_id: UUID string identifying the tenant/organization.
        user_id: UUID string identifying the user/actor.
        action_data: Arbitrary decision payload dictionary.
    """

    tenant_id: Union[str, UUID] = Field(
        ...,
        description="UUID string identifying the tenant",
        examples=["550e8400-e29b-41d4-a716-446655440000"],
    )
    user_id: Union[str, UUID] = Field(
        ...,
        description="UUID string identifying the user/actor",
        examples=["a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d"],
    )
    action_data: Dict[str, Any] = Field(
        ...,
        description="Action decision metadata dictionary",
        examples=[{"decision": "grant_least_privilege", "resource": "prod-k8s"}],
    )


# Common aliases
AuditDecisionPayload = DecisionEventPayload
AuditDecisionEvent = DecisionEventPayload
DecisionEvent = DecisionEventPayload
DecisionPayload = DecisionEventPayload


class DecisionIngestResponse(BaseModel):
    status: str = "accepted"
    stream_key: str
    partition: int
    event_id: Optional[str] = None


router = APIRouter(tags=["audit-decision-stream"])


async def _handle_decision_event(
    payload: DecisionEventPayload,
    redis: aioredis.Redis,
    caller_claims: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    # 1. Standardize tenant_id as string and enforce tenant boundary when caller is authenticated
    tenant_id_str = str(payload.tenant_id)
    if caller_claims is not None:
        caller_org = str(caller_claims.get("org_id") or "").strip()
        caller_role = str(caller_claims.get("role") or "").lower()
        if caller_org and caller_org != tenant_id_str and caller_role not in ("admin", "ciso"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cross-tenant audit stream write is not permitted",
            )

    # 2. Partitioning logic: mmh3.hash(tenant_id, signed=False) % 64
    partition_id = mmh3.hash(tenant_id_str, signed=False) % 64

    # 3. Stream key: audit_stream:partition_{id}
    stream_key = f"audit_stream:partition_{partition_id}"

    # 4. Serialize payload so all values are strings (Redis stream requirement)
    stream_payload: dict[str, str] = {
        "tenant_id": tenant_id_str,
        "user_id": str(payload.user_id),
        "action_data": json.dumps(payload.action_data),
    }

    # 5. Append event to the partitioned stream with maxlen=100000
    try:
        event_id = await redis.xadd(stream_key, stream_payload, maxlen=100000)
    except (
        RedisConnectionError,
        RedisTimeoutError,
        RedisError,
        ConnectionError,
        OSError,
    ) as exc:
        logger.error(
            "redis_stream_ingest_failed",
            stream_key=stream_key,
            partition=partition_id,
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Event ingestion service unavailable: Redis connection error",
        ) from exc

    return {
        "status": "accepted",
        "stream_key": stream_key,
        "partition": partition_id,
        "event_id": str(event_id) if event_id is not None else None,
    }


@router.post(
    "/api/audit/decision",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=DecisionIngestResponse,
    summary="Ingest audit decision event into partitioned Redis streams",
)
async def ingest_audit_decision(
    payload: DecisionEventPayload,
    redis: aioredis.Redis = Depends(get_redis_client),
    caller_claims: Optional[dict[str, Any]] = Depends(verify_audit_stream_caller),
) -> dict[str, Any]:
    """High-throughput event ingestion endpoint returning HTTP 202 Accepted.

    - Computes partition via MurmurHash3 modulo 64.
    - Appends serialized payload to `audit_stream:partition_{id}`.
    - Guaranteed zero Postgres / SQLAlchemy dependencies.
    - Returns HTTP 503 on Redis connectivity failures.
    """
    return await _handle_decision_event(payload, redis, caller_claims)


@router.post(
    "/decision",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=DecisionIngestResponse,
    include_in_schema=False,
)
async def ingest_audit_decision_prefixed(
    payload: DecisionEventPayload,
    redis: aioredis.Redis = Depends(get_redis_client),
    caller_claims: Optional[dict[str, Any]] = Depends(verify_audit_stream_caller),
) -> dict[str, Any]:
    """Prefixed mount fallback (e.g. if router is mounted at /api/audit)."""
    return await _handle_decision_event(payload, redis, caller_claims)


@router.post(
    "/api/v1/audit/decision",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=DecisionIngestResponse,
    include_in_schema=False,
)
async def ingest_audit_decision_v1(
    payload: DecisionEventPayload,
    redis: aioredis.Redis = Depends(get_redis_client),
    caller_claims: Optional[dict[str, Any]] = Depends(verify_audit_stream_caller),
) -> dict[str, Any]:
    """Versioned alias matching CORTEX /api/v1 routing standards."""
    return await _handle_decision_event(payload, redis, caller_claims)
