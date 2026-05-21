# core/rbac.py — Server-side RBAC (canonical roles + permissions). Enforced on mutating API routes.

from __future__ import annotations

from enum import Enum
from typing import Any

from fastapi import Depends, HTTPException, status

from core.canonical_roles import CanonicalRole, normalize_canonical_role


class Permission(str, Enum):
    run_assessment = "run_assessment"
    approve_review = "approve_review"
    override_review = "override_review"
    edit_findings = "edit_findings"
    ingest_document = "ingest_document"
    manage_integrations = "manage_integrations"
    manage_api_keys = "manage_api_keys"
    generate_report = "generate_report"
    toggle_demo = "toggle_demo"
    access_settings = "access_settings"


ROLE_PERMISSIONS: dict[CanonicalRole, frozenset[Permission]] = {
    CanonicalRole.admin: frozenset(
        {
            Permission.run_assessment,
            Permission.approve_review,
            Permission.override_review,
            Permission.edit_findings,
            Permission.ingest_document,
            Permission.manage_integrations,
            Permission.manage_api_keys,
            Permission.generate_report,
            Permission.toggle_demo,
            Permission.access_settings,
        }
    ),
    CanonicalRole.analyst: frozenset(
        {
            Permission.run_assessment,
            Permission.approve_review,
            Permission.edit_findings,
            Permission.ingest_document,
            Permission.manage_integrations,
            Permission.generate_report,
        }
    ),
    CanonicalRole.viewer: frozenset(
        {
            Permission.generate_report,
        }
    ),
}


def user_has_permission(user: dict[str, Any], permission: Permission) -> bool:
    role = normalize_canonical_role(str(user.get("role") or ""))
    return permission in ROLE_PERMISSIONS[role]


def require_permission(permission: Permission):
    """FastAPI dependency: authenticated user must hold ``permission``."""
    from core.security import get_current_user

    async def _dep(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        if not user_has_permission(current_user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission.value}",
            )
        return current_user

    return _dep


def require_permission_stream(permission: Permission):
    """SSE/stream routes that authenticate via query ``token`` or Authorization header."""
    from core.security import get_current_user_stream

    async def _dep(current_user: dict[str, Any] = Depends(get_current_user_stream)) -> dict[str, Any]:
        if not user_has_permission(current_user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission.value}",
            )
        return current_user

    return _dep
