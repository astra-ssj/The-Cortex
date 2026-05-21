# core/canonical_roles.py — Role normalization (no FastAPI / security imports).

from __future__ import annotations

from enum import Enum


class CanonicalRole(str, Enum):
    admin = "admin"
    analyst = "analyst"
    viewer = "viewer"


def normalize_canonical_role(raw: str | None) -> CanonicalRole:
    """
    Map DB/JWT role strings to canonical roles. Unknown values fail closed to viewer.
    """
    r = (raw or "").strip().lower()
    if r in ("admin", "administrator"):
        return CanonicalRole.admin
    if r in ("analyst", "ciso", "dpo", "security_lead", "grc_analyst"):
        return CanonicalRole.analyst
    if r in ("viewer", "auditor", "read_only", "readonly"):
        return CanonicalRole.viewer
    return CanonicalRole.viewer
