# api/v1 — Register all v1 routers (frameworks, organisations, assessments, findings, auth, reports, groups)

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1", tags=["v1"])

from app.api.v1.endpoints import frameworks
from app.api.v1.endpoints import organisations
from app.api.v1.endpoints import assessments
from app.api.v1.endpoints import findings
from app.api.v1.endpoints import auth
from app.api.v1.endpoints import reports
from app.api.v1.endpoints import groups
from app.api.v1.endpoints import integrations

router.include_router(
    auth.router, prefix="/auth", tags=["auth"])
router.include_router(
    frameworks.router, prefix="/frameworks", tags=["frameworks"])
router.include_router(
    organisations.router, prefix="/organisations", tags=["organisations"])
router.include_router(
    assessments.router, prefix="/assessments", tags=["assessments"])
router.include_router(
    findings.router, prefix="/findings", tags=["findings"])
router.include_router(
    reports.router, prefix="/reports", tags=["reports"])
router.include_router(
    groups.router, prefix="/groups", tags=["groups"])
router.include_router(
    integrations.router, prefix="/integrations", tags=["integrations"])
