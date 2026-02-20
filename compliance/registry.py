# compliance/registry.py — Central registry for compliance frameworks.
# New framework: implement get_<id>() following nist_csf.py, then register here.

from __future__ import annotations

import structlog

from compliance.compliance import FrameworkId
from compliance.models import Framework

logger = structlog.get_logger()

# Module-level registry: framework_id -> Framework instance. Populated at import by register_all().
REGISTRY: dict[FrameworkId, Framework] = {}


def register(framework: Framework, framework_id: FrameworkId) -> None:
    """Register a framework under the given FrameworkId. Idempotent for same id."""
    framework.id = framework_id.value
    REGISTRY[framework_id] = framework
    logger.info("framework_registered", framework_id=framework_id.value, control_count=len(framework.controls))


def get(framework_id: FrameworkId) -> Framework | None:
    """Return the framework for the given id, or None if not registered."""
    return REGISTRY.get(framework_id)


def register_all() -> None:
    """Register all built-in frameworks. Call once at startup or import."""
    from compliance import gdpr, nist_csf, nis2

    register(nist_csf.get_nist_csf(), FrameworkId.NIST_CSF)
    register(gdpr.get_gdpr(), FrameworkId.GDPR)
    register(nis2.get_nis2(), FrameworkId.NIS2)
