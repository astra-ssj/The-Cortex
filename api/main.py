# api/main.py — FastAPI app for CORTEX compliance API.

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from api.assessments import router as assessments_router
from api.auth import router as auth_router
from api.findings import router as findings_router
from api.groups import router as groups_router
from api.organisations import router as organisations_router
from api.system import router as system_router

# Compliance-engine app (document ingestion at services/compliance-engine/app/).
_compliance_engine = Path(__file__).resolve().parent.parent / "services" / "compliance-engine"
if _compliance_engine.exists() and str(_compliance_engine) not in sys.path:
    sys.path.insert(0, str(_compliance_engine))
try:
    from app.api.v1 import router as v1_router
    _has_v1 = True
except ImportError:
    v1_router = None
    _has_v1 = False

logger = structlog.get_logger()


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
    # Shutdown: nothing to close for in-memory registry.


app = FastAPI(
    title="CORTEX Compliance API",
    version="0.1.0",
    lifespan=lifespan,
)

# Rate-limit headers (stub: actual limits enforced at gateway/reverse proxy).
class RateLimitHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-RateLimit-Limit", "1000")
        response.headers.setdefault("X-RateLimit-Remaining", "999")
        return response


app.add_middleware(RateLimitHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
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
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(assessments_router)
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


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready"}
