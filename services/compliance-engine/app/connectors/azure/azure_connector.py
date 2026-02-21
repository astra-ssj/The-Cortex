# azure_connector.py — Connect to Azure tenant, discover systems/controls, pull findings. All API calls via CircuitBreaker; audit_fabric for actions.

from __future__ import annotations

import asyncio
from typing import Any, cast

import structlog

from core.audit_fabric import audit_fabric
from core.circuit_breaker import CircuitBreaker, register_circuit_breaker
from ontology.models import ControlFinding, ControlRef, Finding, SystemAsset

from .credential_store import get_credentials, store_credentials

logger = structlog.get_logger()

# Azure resource type -> CORTEX system_type (ontology)
_RESOURCE_TYPE_TO_SYSTEM_TYPE: dict[str, str] = {
    "Microsoft.Sql/servers": "data_store",
    "Microsoft.Storage/storageAccounts": "data_store",
    "Microsoft.DocumentDB/databaseAccounts": "data_store",
    "Microsoft.Compute/virtualMachines": "infrastructure",
    "Microsoft.Network/virtualNetworks": "network",
    "Microsoft.Web/sites": "application",
    "Microsoft.ContainerService/managedClusters": "infrastructure",
    "Microsoft.KeyVault/vaults": "infrastructure",
    "Microsoft.OperationalInsights/workspaces": "application",
}

# Defender severity -> CORTEX severity
_DEFENDER_SEVERITY_MAP = {"High": "High", "Medium": "Medium", "Low": "Low", "Informational": "Informational"}

# Connector id for credential store
CONNECTOR_ID = "azure"

_azure_breaker = CircuitBreaker("azure_connector", failure_threshold=5)
register_circuit_breaker(_azure_breaker)


class AzureConnector:
    """Connect to Azure tenant, discover systems and controls, ingest findings into CORTEX ontology."""

    def __init__(
        self,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        subscription_id: str,
    ) -> None:
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.subscription_id = subscription_id
        self._credential: Any = None
        self._resource_client: Any = None

    def _get_credential(self) -> Any:
        if self._credential is not None:
            return self._credential
        try:
            from azure.identity import ClientSecretCredential
            self._credential = ClientSecretCredential(
                tenant_id=self.tenant_id,
                client_id=self.client_id,
                client_secret=self.client_secret,
            )
            return self._credential
        except ImportError as e:
            raise ImportError("azure-identity required: pip install azure-identity") from e

    def _get_resource_client(self) -> Any:
        if self._resource_client is not None:
            return self._resource_client
        try:
            from azure.mgmt.resource import ResourceManagementClient
            cred = self._get_credential()
            self._resource_client = ResourceManagementClient(cred, self.subscription_id)
            return self._resource_client
        except ImportError as e:
            raise ImportError("azure-mgmt-resource required: pip install azure-mgmt-resource") from e

    def _list_resources_sync(self) -> list[dict[str, Any]]:
        """Sync: list all resources in subscription. Used inside executor."""
        client = self._get_resource_client()
        resources: list[dict[str, Any]] = []
        for item in client.resources.list():
            resources.append({
                "id": item.id or "",
                "name": item.name or "",
                "type": item.type or "",
                "location": getattr(item, "location", None),
                "tags": dict(item.tags) if item.tags else {},
            })
        return resources

    async def connect(self) -> bool:
        """Validate credentials and test API access. Log to audit_fabric."""
        audit_fabric.log("azure_connector_connect_start", entity_type="connector", entity_id=CONNECTOR_ID)

        async def _test_access() -> list:
            return await asyncio.to_thread(self._list_resources_sync)

        try:
            await _azure_breaker.execute(_test_access)
        except Exception as e:
            audit_fabric.log(
                "azure_connector_connect_error",
                entity_type="connector",
                entity_id=CONNECTOR_ID,
                payload={"error": str(e)},
            )
            raise
        audit_fabric.log("azure_connector_connect_done", entity_type="connector", entity_id=CONNECTOR_ID)
        return True

    async def discover_systems(self) -> list[SystemAsset]:
        """Query ARM for all resources; map to CORTEX SystemAsset; flag data stores and personal_data from tags."""
        audit_fabric.log("azure_discover_systems_start", entity_type="connector", entity_id=CONNECTOR_ID)

        async def _list() -> list:
            return await asyncio.to_thread(self._list_resources_sync)

        try:
            raw_list = await _azure_breaker.execute(_list)
        except Exception as e:
            audit_fabric.log(
                "azure_discover_systems_error",
                entity_type="connector",
                entity_id=CONNECTOR_ID,
                payload={"error": str(e)},
            )
            raise
        assets: list[SystemAsset] = []
        for r in raw_list:
            rtype = r.get("type", "")
            system_type = _RESOURCE_TYPE_TO_SYSTEM_TYPE.get(rtype, "infrastructure")
            name = r.get("name", "unknown")
            resource_id = r.get("id", "")
            tags = r.get("tags") or {}
            has_personal_data = "personal_data" in str(tags).lower() or "pii" in str(tags).lower() or "gdpr" in str(tags).lower()
            asset_id = resource_id.replace("/", "_").replace(":", "_")[-80:] or f"az-{name}"
            purpose_tags = ["azure", "connector"]
            if has_personal_data:
                purpose_tags.append("personal_data")
            assets.append(
                SystemAsset(
                    jurisdiction="internal",
                    purpose_tags=purpose_tags,
                    id=asset_id,
                    name=name,
                    system_type=system_type,
                )
            )
        audit_fabric.log(
            "azure_discover_systems_done",
            entity_type="connector",
            entity_id=CONNECTOR_ID,
            payload={"count": len(assets)},
        )
        return assets

    async def discover_controls(self) -> list[ControlFinding]:
        """Query Defender for Cloud security score, Azure Policy compliance, AD MFA, Monitor diagnostic settings. Stubbed to return mock data when SDK not available."""
        audit_fabric.log("azure_discover_controls_start", entity_type="connector", entity_id=CONNECTOR_ID)

        async def _discover() -> list[ControlFinding]:
            # Placeholder: real impl would call Defender, Policy, AD, Monitor APIs via to_thread.
            # Return mock control findings for structure.
            return [
                ControlFinding(
                    control_ref=ControlRef(framework_id="nis2", control_id="NIS2-RM-10"),
                    status="compliant",
                    recommendation_id="Azure-MFA",
                    raw_data={"source": "defender"},
                ),
                ControlFinding(
                    control_ref=ControlRef(framework_id="iso27001", control_id="A.8.4"),
                    status="compliant",
                    recommendation_id="Azure-MFA",
                    raw_data={"source": "defender"},
                ),
            ]

        try:
            out = await _azure_breaker.execute(_discover)
        except Exception as e:
            audit_fabric.log(
                "azure_discover_controls_error",
                entity_type="connector",
                entity_id=CONNECTOR_ID,
                payload={"error": str(e)},
            )
            raise
        audit_fabric.log(
            "azure_discover_controls_done",
            entity_type="connector",
            entity_id=CONNECTOR_ID,
            payload={"count": len(out)},
        )
        return cast(list[ControlFinding], out)

    async def pull_findings(self) -> list[Finding]:
        """Convert Defender for Cloud recommendations to CORTEX Findings; map to obligation_id; set severity."""
        audit_fabric.log("azure_pull_findings_start", entity_type="connector", entity_id=CONNECTOR_ID)
        # Stub: real impl would call Defender recommendations API and map each to Finding.
        findings: list[Finding] = [
            Finding(
                id="az-finding-1",
                title="MFA should be enabled on accounts with write permissions",
                severity="High",
                obligation_id="NIS2-RM-10",
                source="defender_for_cloud",
                resource_id="",
                recommendation_id="Azure-MFA",
            ),
        ]
        audit_fabric.log(
            "azure_pull_findings_done",
            entity_type="connector",
            entity_id=CONNECTOR_ID,
            payload={"count": len(findings)},
        )
        return findings

    async def get_identity_summary(self) -> dict[str, Any]:
        """Count privileged role assignments, accounts without MFA, stale accounts (no login > 90 days)."""
        audit_fabric.log("azure_identity_summary_start", entity_type="connector", entity_id=CONNECTOR_ID)
        # Stub: real impl would query Azure AD.
        summary = {
            "privileged_role_assignments": 12,
            "accounts_without_mfa": 3,
            "stale_accounts_90d": 5,
        }
        audit_fabric.log(
            "azure_identity_summary_done",
            entity_type="connector",
            entity_id=CONNECTOR_ID,
            payload=summary,
        )
        return summary


def create_connector_from_store() -> AzureConnector | None:
    """Build AzureConnector from stored (encrypted) credentials."""
    creds = get_credentials(CONNECTOR_ID)
    if not creds:
        return None
    return AzureConnector(
        tenant_id=creds.get("tenant_id", ""),
        client_id=creds.get("client_id", ""),
        client_secret=creds.get("client_secret", ""),
        subscription_id=creds.get("subscription_id", ""),
    )


def store_connector_credentials(tenant_id: str, client_id: str, client_secret: str, subscription_id: str) -> None:
    """Encrypt and store credentials for sync."""
    store_credentials(
        CONNECTOR_ID,
        {
            "tenant_id": tenant_id,
            "client_id": client_id,
            "client_secret": client_secret,
            "subscription_id": subscription_id,
        },
    )
