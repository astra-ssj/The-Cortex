# core/context_builder.py — Builds structured context for the assessment engine (LLM prompt input).

from __future__ import annotations

from typing import Any, Optional, cast

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from compliance.models import Control
from db.models import Organization

logger = structlog.get_logger()


async def get_org_profile(session: AsyncSession, organization_id: str) -> Organization | None:
    """Load organization profile from PostgreSQL."""
    result = await session.execute(select(Organization).where(Organization.id == organization_id))
    return cast(Optional[Organization], result.scalars().first())


def _format_control_for_prompt(control: Control) -> str:
    """Format control and its requirements as text for LLM context."""
    lines = [f"Control: {control.name}", f"Domain: {control.domain or '—'}", "Requirements:"]
    for r in control.requirements:
        art = f" ({r.article_ref})" if r.article_ref else ""
        lines.append(f"  - {r.id}{art}: {r.description}")
        for e in r.evidence_types:
            lines.append(f"    Evidence: {e.name} — {e.description or '—'}")
    return "\n".join(lines)


def build_context(
    org: Organization,
    control: Control,
) -> dict[str, Any]:
    """
    Format organization + control into a structured context dict for the assessment engine.
    Used to build LLM prompt input; no LLM call here (CircuitBreaker wraps calls in assessment engine).
    """
    org_dict: dict[str, Any] = {
        "id": org.id,
        "name": org.name,
        "jurisdiction": org.jurisdiction,
        "purpose_tags": list(org.purpose_tags) if org.purpose_tags else [],
        "industry": org.industry,
        "region": org.region,
        "description": org.description,
        "metadata": dict(org.metadata_) if org.metadata_ else {},
    }
    control_dict: dict[str, Any] = {
        "id": control.id,
        "name": control.name,
        "domain": control.domain,
        "requirements": [
            {
                "id": r.id,
                "article_ref": r.article_ref,
                "description": r.description,
                "evidence_types": [{"id": e.id, "name": e.name, "description": e.description} for e in r.evidence_types],
            }
            for r in control.requirements
        ],
    }
    prompt_section = (
        f"Organization: {org.name} (id={org.id})\n"
        f"Jurisdiction: {org.jurisdiction}; Region: {org.region or '—'}; Industry: {org.industry or '—'}\n"
        f"Description: {org.description or '—'}\n\n"
        f"{_format_control_for_prompt(control)}"
    )
    return {
        "organization": org_dict,
        "control": control_dict,
        "prompt_context": prompt_section,
    }


async def get_context_for_control(
    session: AsyncSession,
    organization_id: str,
    control: Control,
) -> dict[str, Any] | None:
    """
    Pull org profile from PostgreSQL and return structured context for the given control.
    Returns None if organization is not found.
    """
    org = await get_org_profile(session, organization_id)
    if org is None:
        logger.warning("organization_not_found", organization_id=organization_id)
        return None
    return build_context(org, control)
