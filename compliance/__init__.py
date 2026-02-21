# compliance — CORTEX compliance framework engine (ZTAIP).
# Use registry.get(FrameworkId.GDPR_2016_679) after register_all().

from __future__ import annotations

from compliance.compliance import FrameworkId
from compliance.registry import REGISTRY, exists, get, register_all

# Register all built-in frameworks when package is imported.
register_all()

__all__ = ["FrameworkId", "get", "exists", "REGISTRY", "register_all"]
