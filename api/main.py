# api/main.py — FastAPI app for CORTEX compliance API.

from __future__ import annotations

import os
import secrets
import uuid
from contextlib import asynccontextmanager
from typing import Callable

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from api.errors import (
    error_body,
    json_error,
    request_validation_exception_handler,
    sqlalchemy_exception_handler,
    starlette_http_exception_handler,
    unhandled_exception_handler,
)
from api.assessments import router as assessments_router
from api.auth import router as auth_router
from api.limits import limiter
from api.findings import router as findings_router
from api.graph import router as graph_router
from api.groups import router as groups_router
from api.intelligence import router as intelligence_router
from api.organisations import router as organisations_router
from api.microsoft_cloud import router as microsoft_cloud_router
from api.shasta_cloud import router as shasta_cloud_router
from api.system import router as system_router
from api.ingest import router as ingest_router
from api.connectors_aws import router as connectors_aws_router
from api.connectors_azure import router as connectors_azure_router
from api.connectors_shasta import router as connectors_shasta_router
from api.reports import router as reports_router
from api.integrations import router as integrations_router
from api.skills import router as skills_router
from core.circuit_breaker import load_circuit_breaker_states_from_db
from db.session import database_ready, ensure_org_onboarding_schema, ensure_security_auth_schema

logger = structlog.get_logger()

_MAX_BODY_BYTES = int(os.getenv("CORTEX_MAX_BODY_BYTES", str(2 * 1024 * 1024)))
_CSRF_PROTECT = os.getenv("CORTEX_CSRF_PROTECT", "0").lower() in ("1", "true", "yes")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure compliance registry is loaded (side effect of import).
    import compliance  # noqa: F401

    await ensure_org_onboarding_schema()
    await ensure_security_auth_schema()
    await load_circuit_breaker_states_from_db()

    try:
        from core.skills_loader import get_skills_loader

        loader = get_skills_loader()
        summary = loader.summary()
        logger.info(
            "grc_skills_ready",
            loaded=summary["loaded"],
            total=summary["total"],
            skills=summary.get("skills", []),
        )
    except Exception as e:
        logger.warning("grc_skills_load_failed", error=str(e))

    yield
    # Shasta optional Redis queue: see core/shasta_queue.py + workers/shasta_worker.py (no API pool here).


app = FastAPI(
    title="CORTEX Compliance API",
    version="0.1.0",
    lifespan=lifespan,
)
app.state.limiter = limiter


async def _rate_limit_envelope_handler(request: Request, exc: RateLimitExceeded) -> Response:
    return json_error(
        "TOO_MANY_REQUESTS",
        str(getattr(exc, "detail", "rate limit exceeded")),
        429,
    )


app.add_exception_handler(RateLimitExceeded, _rate_limit_envelope_handler)
app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(StarletteHTTPException, starlette_http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-XSS-Protection", "1; mode=block")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=()",
        )
        return response


class RequestBodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject oversized bodies using Content-Length (first-line DoS mitigation)."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
            return await call_next(request)
        cl = request.headers.get("content-length")
        if cl:
            try:
                n = int(cl)
                if n > _MAX_BODY_BYTES:
                    return json_error(
                        "PAYLOAD_TOO_LARGE",
                        f"Request body exceeds maximum of {_MAX_BODY_BYTES} bytes",
                        413,
                    )
            except ValueError:
                pass
        return await call_next(request)


class CsrfProtectionMiddleware(BaseHTTPMiddleware):
    """Optional double-submit CSRF when ``CORTEX_CSRF_PROTECT=1``. JWT Bearer clients skip (no cookie)."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not _CSRF_PROTECT:
            return await call_next(request)
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)
        path = request.url.path.split("?", 1)[0]
        if not path.startswith("/api/"):
            return await call_next(request)
        auth = (request.headers.get("authorization") or "").strip()
        if auth.lower().startswith("bearer "):
            return await call_next(request)
        cookie = request.cookies.get("cortex_csrf")
        hdr = request.headers.get("x-csrf-token") or request.headers.get("X-CSRF-Token")
        if cookie and hdr and secrets.compare_digest(cookie, hdr):
            return await call_next(request)
        return json_error(
            "FORBIDDEN",
            "CSRF validation failed — send X-CSRF-Token matching cortex_csrf cookie or use Authorization Bearer",
            403,
        )


class ApiVersionEnforcementMiddleware(BaseHTTPMiddleware):
    """Reject ``/api/...`` routes that are not under ``/api/v1`` (non-versioned paths are not supported)."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method == "OPTIONS":
            return await call_next(request)
        path = request.url.path.split("?", 1)[0]
        if not path.startswith("/api/"):
            return await call_next(request)
        if path == "/api/v1" or path.startswith("/api/v1/"):
            return await call_next(request)
        return JSONResponse(
            status_code=404,
            content=error_body(
                "NOT_FOUND",
                "API routes require the /api/v1 prefix (for example /api/v1/frameworks).",
            ),
        )


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Propagate X-Request-ID for log/trace correlation (client-supplied or generated)."""

    _HEADER = "X-Request-ID"

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        incoming = request.headers.get("x-request-id")
        rid = incoming.strip() if incoming else ""
        if not rid:
            rid = str(uuid.uuid4())
        response = await call_next(request)
        response.headers[self._HEADER] = rid
        return response


_frontend = os.getenv("FRONTEND_URL", "http://localhost:3000").strip().rstrip("/")
_cors_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:3004",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3003",
    "http://127.0.0.1:3004",
]
if _frontend and _frontend not in _cors_origins:
    _cors_origins.append(_frontend)

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(ApiVersionEnforcementMiddleware)
app.add_middleware(CsrfProtectionMiddleware)
app.add_middleware(RequestBodySizeLimitMiddleware)

# Canonical routers — single FastAPI surface (no nested compliance-engine mount).
app.include_router(auth_router, prefix="/api/v1")
app.include_router(assessments_router)
app.include_router(shasta_cloud_router)
app.include_router(microsoft_cloud_router)
app.include_router(findings_router, prefix="/api/v1/findings")
app.include_router(graph_router)
app.include_router(intelligence_router)
app.include_router(groups_router)
app.include_router(organisations_router)
app.include_router(reports_router, prefix="/api/v1/reports")
app.include_router(integrations_router, prefix="/api/v1/integrations")
app.include_router(skills_router, prefix="/api/v1/skills")
app.include_router(ingest_router, prefix="/api/v1")
app.include_router(connectors_aws_router, prefix="/api/v1")
app.include_router(connectors_azure_router, prefix="/api/v1")
app.include_router(connectors_shasta_router, prefix="/api/v1")
app.include_router(system_router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness: process is up (does not check Postgres)."""
    return {"status": "ok"}


@app.get("/ready", response_model=None)
async def ready() -> dict[str, str] | JSONResponse:
    """Readiness: Postgres must accept connections."""
    if not await database_ready():
        return json_error(
            "SERVICE_UNAVAILABLE",
            "Database is not reachable",
            503,
        )
    return {"status": "ready", "database": "ok"}
