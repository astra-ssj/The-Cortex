# api/v1 — Register all v1 routers (ingest, azure connector, aws connector, assessments, etc.)

from __future__ import annotations

from fastapi import APIRouter

from .azure import router as azure_router
from .aws import router as aws_router
from .endpoints.assessments import router as assessments_router
from .endpoints.findings import router as findings_router
from .ingest import router as ingest_router

router = APIRouter(prefix="/api/v1", tags=["v1"])
router.include_router(ingest_router, tags=["ingestion"])
router.include_router(azure_router)
router.include_router(aws_router)
router.include_router(assessments_router)
router.include_router(findings_router, prefix="/findings", tags=["findings"])
