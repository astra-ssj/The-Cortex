# api/main.py — FastAPI app for CORTEX compliance API.

from __future__ import annotations

import os
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from api.assessments import router as assessments_router
from api.auth import router as auth_router
from api.limits import limiter
from api.findings import router as findings_router
from api.groups import router as groups_router
from api.organisations import router as organisations_router
from api.shasta_cloud import router as shasta_cloud_router
from api.system import router as system_router
from db.session import database_ready

# Compliance-engine app (document ingestion at services/compliance-engine/app/).
_compliance_engine = Path(__file__).resolve().parent.parent / "services" / "compliance-engine"
if _compliance_engine.exists() and str(_compliance_engine) not in sys.path:
    sys.path.insert(0, str(_compliance_engine))
try:
    from app.api.v1 import router as v1_router
    _has_v1 = True
    _v1_import_error: str | None = None
except ImportError as _v1_import_err:
    v1_router = None
    _has_v1 = False
    _v1_import_error = str(_v1_import_err)

logger = structlog.get_logger()
if not _has_v1:
    logger.warning(
        "compliance_engine_v1_import_failed",
        detail=_v1_import_error,
        hint="Fix the venv (e.g. pip install -e . from repo root); Shasta extra does not load until import succeeds.",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure compliance registry is loaded (side effect of import).
    import compliance  # noqa: F401

    if _has_v1:
        try:
            from app.core.skills_loader import get_skills_loader

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
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


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

app.include_router(auth_router, prefix="/api/v1")
app.include_router(assessments_router)
app.include_router(shasta_cloud_router)
app.include_router(findings_router, prefix="/api/v1/findings")
app.include_router(groups_router)
# Prefer root api.organisations (DB-backed posture) over compliance-engine stub when both register /api/v1/organisations.
app.include_router(organisations_router)
if _has_v1:
    app.include_router(v1_router)
app.include_router(system_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", response_model=None)
async def ready() -> dict[str, str] | JSONResponse:
    if not await database_ready():
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "detail": "database_unreachable"},
        )
    return {"status": "ready"}
