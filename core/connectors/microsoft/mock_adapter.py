# mock_adapter.py — Deterministic Microsoft 365 signals for demo and CI (CORTEX_M365_MOCK).

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import structlog

from core.audit_fabric import audit_fabric
from ontology.models import NormalizedFinding

logger = structlog.get_logger()

CONNECTOR_ENTITY = "microsoft-365"


def is_m365_mock_mode() -> bool:
    """Mock sync enabled unless explicitly disabled (default on for local demo)."""
    return os.getenv("CORTEX_M365_MOCK", "1").lower() not in ("0", "false", "no")


def _mock_findings(sync_run_id: str, org_id: str) -> list[NormalizedFinding]:
    """Realistic Entra / M365 configuration gaps mapped to CORTEX framework controls."""
    now = datetime.now(timezone.utc).isoformat()
    base = {
        "source_engine": "microsoft_graph",
        "scan_run_id": sync_run_id,
        "cloud_provider": "microsoft365",
        "account_scope": org_id,
        "region": "global",
        "compliance_status": "fail",
        "collected_at": now,
    }
    rows: list[dict] = [
        {
            "finding_key": "m365-mfa-gap-admins",
            "external_id": "AAD-MFA-001",
            "check_id": "AAD.MFA.AdminCoverage",
            "title": "17 privileged accounts without MFA enforced",
            "description": "Conditional Access requires MFA for admins, but 17 accounts in Global Administrator and Security Administrator roles bypass enforcement via legacy policy exceptions.",
            "severity_normalized": "CRITICAL",
            "resource_type": "entra_user",
            "resource_id": "directory-role:privileged",
            "framework_controls": {
                "iso27001-2022": ["ISO-A.5.17"],
                "gdpr-2016-679": ["GDPR-Art.32"],
                "nis2-2022-2555": ["NIS2-Art.21(2)(i)"],
                "nist-csf-2.0": ["NIST-PR.AC-1"],
            },
            "remediation": "Enforce MFA via Conditional Access for all privileged roles; remove legacy per-user MFA exceptions.",
        },
        {
            "finding_key": "m365-legacy-auth",
            "external_id": "AAD-AUTH-002",
            "check_id": "AAD.Auth.LegacyProtocols",
            "title": "Legacy authentication protocols enabled",
            "description": "SMTP AUTH and IMAP remain enabled tenant-wide; 4 service accounts authenticated via basic auth in the last 7 days.",
            "severity_normalized": "HIGH",
            "resource_type": "entra_policy",
            "resource_id": "authenticationPolicy:legacy",
            "framework_controls": {
                "iso27001-2022": ["ISO-A.5.17", "ISO-A.8.5"],
                "gdpr-2016-679": ["GDPR-Art.32"],
            },
            "remediation": "Block legacy authentication via Conditional Access; migrate service accounts to OAuth.",
        },
        {
            "finding_key": "m365-ca-device-compliance",
            "external_id": "AAD-CA-003",
            "check_id": "AAD.CA.DeviceCompliance",
            "title": "No device compliance requirement for corporate data access",
            "description": "SharePoint and Exchange access policies do not require compliant or hybrid-joined devices for standard users.",
            "severity_normalized": "MEDIUM",
            "resource_type": "conditional_access",
            "resource_id": "ca-policy:default-access",
            "framework_controls": {
                "iso27001-2022": ["ISO-A.5.15"],
                "nis2-2022-2555": ["NIS2-Art.21(2)(i)"],
            },
            "remediation": "Add device compliance grant control to primary user access policies.",
        },
        {
            "finding_key": "m365-guest-access-review",
            "external_id": "AAD-GUEST-004",
            "check_id": "AAD.Guest.AccessReview",
            "title": "Guest users without access review — 23 stale accounts",
            "description": "B2B guests invited more than 90 days ago have not completed access review; 23 accounts retain active sessions.",
            "severity_normalized": "HIGH",
            "resource_type": "entra_user",
            "resource_id": "guest-users:stale",
            "framework_controls": {
                "iso27001-2022": ["ISO-A.5.16"],
                "gdpr-2016-679": ["GDPR-Art.32"],
            },
            "remediation": "Configure Entra access reviews for guest users quarterly.",
        },
        {
            "finding_key": "m365-dlp-teams-gap",
            "external_id": "M365-DLP-005",
            "check_id": "M365.DLP.TeamsCoverage",
            "title": "DLP policies do not cover Microsoft Teams chat",
            "description": "Existing DLP policies apply to Exchange and SharePoint only; Teams private channels excluded from sensitive data rules.",
            "severity_normalized": "MEDIUM",
            "resource_type": "purview_dlp",
            "resource_id": "dlp-policy:teams-gap",
            "framework_controls": {
                "gdpr-2016-679": ["GDPR-Art.32"],
                "iso27001-2022": ["ISO-A.5.34"],
            },
            "remediation": "Extend Purview DLP policies to Teams workloads and private channels.",
        },
        {
            "finding_key": "m365-pim-not-required",
            "external_id": "AAD-PIM-006",
            "check_id": "AAD.PIM.ActivationRequired",
            "title": "5 permanent privileged role assignments (PIM not required)",
            "description": "Global Administrator and User Administrator roles assigned permanently without time-bound activation or approval workflow.",
            "severity_normalized": "HIGH",
            "resource_type": "entra_role",
            "resource_id": "role:privileged-permanent",
            "framework_controls": {
                "iso27001-2022": ["ISO-A.5.18", "ISO-A.8.2"],
                "nis2-2022-2555": ["NIS2-Art.21(2)(i)"],
                "nist-csf-2.0": ["NIST-PR.AC-1"],
            },
            "remediation": "Convert permanent assignments to PIM eligible roles with approval and MFA on activation.",
        },
    ]
    out: list[NormalizedFinding] = []
    for row in rows:
        out.append(
            NormalizedFinding(
                **base,
                finding_key=row["finding_key"],
                external_id=row["external_id"],
                check_id=row["check_id"],
                title=row["title"],
                description=row["description"],
                severity_normalized=row["severity_normalized"],
                resource_type=row["resource_type"],
                resource_id=row["resource_id"],
                framework_controls=row["framework_controls"],
                remediation=row["remediation"],
                raw_finding={"mock": True, "connector": CONNECTOR_ENTITY, **row},
            )
        )
    return out


async def run_microsoft365_sync(org_id: str) -> tuple[str, list[NormalizedFinding], bool]:
    """
    Run M365 sync. Returns (engine_sync_id, findings, mock_mode).
    Today: mock adapter only; live Graph API when CORTEX_M365_MOCK=0 and credentials exist.
    """
    sync_id = f"m365-sync-{uuid.uuid4().hex[:12]}"
    if not is_m365_mock_mode():
        raise ValueError(
            "Live Microsoft Graph sync is not configured. Set CORTEX_M365_MOCK=1 for demo data "
            "or complete Entra app registration (integrations hub)."
        )

    audit_fabric.log(
        "m365_sync_start",
        entity_type="connector",
        entity_id=CONNECTOR_ENTITY,
        payload={"org_id": org_id, "mock": True},
    )
    findings = _mock_findings(sync_id, org_id)
    audit_fabric.log(
        "m365_sync_done",
        entity_type="connector",
        entity_id=CONNECTOR_ENTITY,
        payload={"org_id": org_id, "findings_count": len(findings), "mock": True},
    )
    logger.info("m365_mock_sync_complete", org_id=org_id, findings=len(findings))
    return sync_id, findings, True
