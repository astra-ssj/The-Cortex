# compliance/registry.py — Central registry for compliance frameworks.
# 10 frameworks: iso27001-2022, gdpr-2016-679, nis2-2022-2555, nist-csf-2.0,
# csa-ccm-v4, cyber-essentials-v3.1, eu-ai-act-2024, eu-cybersecurity-act,
# dora-2022-2554, iso42001-2023.

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


def exists(framework_id: str) -> bool:
    """Return True if the given framework id (string value) is registered."""
    try:
        fid = FrameworkId(framework_id)
        return get(fid) is not None
    except ValueError:
        return False


def register_all() -> None:
    """Register all 10 built-in frameworks including DORA and ISO 42001."""
    from compliance import (
        csa_ccm,
        cyber_essentials,
        dora,
        eu_ai_act,
        eu_cybersecurity_act,
        gdpr,
        iso27001,
        iso42001,
        nist_csf,
        nis2,
    )

    register(iso27001.get_iso27001(), FrameworkId.ISO27001_2022)
    register(gdpr.get_gdpr(), FrameworkId.GDPR_2016_679)
    register(nis2.get_nis2(), FrameworkId.NIS2_2022_2555)
    register(nist_csf.get_nist_csf(), FrameworkId.NIST_CSF_2_0)
    register(csa_ccm.get_csa_ccm(), FrameworkId.CSA_CCM_V4)
    register(cyber_essentials.get_cyber_essentials(), FrameworkId.CYBER_ESSENTIALS_V3_1)
    register(eu_ai_act.get_eu_ai_act(), FrameworkId.EU_AI_ACT_2024)
    register(eu_cybersecurity_act.get_eu_cybersecurity_act(), FrameworkId.EU_CYBERSECURITY_ACT)
    register(dora.get_dora(), FrameworkId.DORA_2022_2554)
    register(iso42001.get_iso42001(), FrameworkId.ISO42001_2023)

