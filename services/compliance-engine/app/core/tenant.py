"""
CORTEX tenant isolation — re-export root ``core.tenant`` for compliance-engine imports.

Authoritative implementation lives at repository ``core/tenant.py`` (single source).
"""

from core.tenant import DEMO_ORG_ID, resolve_scoped_org_id

__all__ = ["DEMO_ORG_ID", "resolve_scoped_org_id"]
