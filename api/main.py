# api/main.py — FastAPI app for CORTEX compliance API.

from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.assessments import router as assessments_router

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure compliance registry is loaded (side effect of import).
    import compliance  # noqa: F401
    yield
    # Shutdown: nothing to close for in-memory registry.


app = FastAPI(
    title="CORTEX Compliance API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assessments_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready"}
