# compliance — CORTEX compliance framework engine (ZTAIP).
# Use registry.get(FrameworkId.GDPR) after register_all().

from __future__ import annotations

from compliance.compliance import FrameworkId
from compliance.registry import get, register_all, REGISTRY

# Register all built-in frameworks when package is imported.
register_all()

__all__ = ["FrameworkId", "get", "REGISTRY", "register_all"]
