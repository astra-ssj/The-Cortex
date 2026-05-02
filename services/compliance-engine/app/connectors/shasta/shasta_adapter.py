# shasta_adapter.py — Single entry point for Transilience Shasta cloud scans → CORTEX normalization.
# Shasta SQLite is never SoT; findings normalize to Postgres-bound evidence shapes downstream.
# Optional: install with pip install -e ".[shasta-scan]" (git dependency; not PyPI `shasta`).

from __future__ import annotations

import asyncio
import hashlib
import json
import os
from contextlib import contextmanager
from typing import Any, Literal, cast

import structlog

from core.audit_fabric import audit_fabric
from core.circuit_breaker import CircuitBreaker, register_circuit_breaker
from ontology.models import Finding, NormalizedFinding

logger = structlog.get_logger()

CONNECTOR_ENTITY = "shasta"

_shasta_breaker = CircuitBreaker("shasta_adapter", failure_threshold=5)
register_circuit_breaker(_shasta_breaker)

# Documented alternative when the Python package is not installed or callers prefer shell isolation.
SUBPROCESS_CONTRACT = """
Shasta (Transilience) Phase A contract — programmatic path is preferred inside CORTEX.

Programmatic (same host, optional extra ``shasta-scan``):
  - Import: ``from shasta.scanner import run_full_scan``
  - AWS: ``from shasta.aws.client import AWSClient`` → ``validate_credentials()`` → ``run_full_scan(client=...)``
  - Azure: ``from shasta.azure.client import AzureClient`` → ``validate_credentials()`` → ``run_full_scan(azure_client=...)``
  - Output: ``ScanResult`` with ``findings`` (Pydantic models); serialize via ``model_dump(mode="json")``.
  - CORTEX maps findings with ``shasta_finding_payload_to_normalized`` / ``run_shasta_scan_for_stored_credentials``.

Subprocess / runner image (no bundled CLI JSON export in upstream Shasta v1.x):
  - Run a one-shot Python runner in an environment where ``shasta`` is installed and cloud credentials
    are supplied (env vars for boto3 / DefaultAzureCredential).
  - Example AWS one-liner (writes NDJSON lines per finding):
    ``python -c "from shasta.aws.client import AWSClient; from shasta.scanner import run_full_scan; \\
import json; c=AWSClient(region='us-east-1'); c.validate_credentials(); \\
r=run_full_scan(client=c); \\
print(json.dumps([f.model_dump(mode='json') for f in r.findings]))"``
  - Downstream: POST captured JSON to a future ingest endpoint or load from object storage; never treat
    Shasta's local SQLite as source of truth — persist only through CORTEX Postgres evidence pipeline.

PyPI warning: package name ``shasta`` on PyPI is the PaSh shell AST library (unrelated). Use the git extra.
""".strip()


def shasta_contract_payload(cloud: Literal["aws", "azure", "any"] = "any") -> dict[str, Any]:
    """Stable JSON for GET handlers (contract + install hint)."""
    return {
        "engine": "transilience-shasta",
        "optional_dependency_extra": "shasta-scan",
        "install": 'pip install -e ".[shasta-scan]"',
        "pypi_note": "Do not pip install bare `shasta` from PyPI — wrong package.",
        "cloud": cloud,
        "subprocess_contract": SUBPROCESS_CONTRACT,
        "sqlite_not_sot": True,
    }


def is_shasta_installed() -> bool:
    try:
        import shasta  # noqa: F401

        return True
    except ImportError:
        return False


def _finding_key_from_payload(payload: dict[str, Any]) -> str:
    blob = json.dumps(payload, sort_keys=True, default=str).encode()
    return hashlib.sha256(blob).hexdigest()[:32]


def _severity_to_cortex(shasta_severity: str) -> str:
    m = {
        "critical": "CRITICAL",
        "high": "High",
        "medium": "Medium",
        "low": "Low",
        "info": "Informational",
    }
    return m.get(str(shasta_severity).lower(), "Informational")


def shasta_finding_payload_to_normalized(
    scan_run_id: str,
    payload: dict[str, Any],
) -> NormalizedFinding:
    """Map a Shasta ``Finding.model_dump()`` dict to ``NormalizedFinding``."""
    sid = str(payload.get("id", ""))
    check_id = str(payload.get("check_id", ""))
    fw = {
        "soc2": list(payload.get("soc2_controls") or []),
        "cis_aws": list(payload.get("cis_aws_controls") or []),
        "cis_azure": list(payload.get("cis_azure_controls") or []),
        "mcsb": list(payload.get("mcsb_controls") or []),
        "iso27001": list(payload.get("iso27001_controls") or []),
        "hipaa": list(payload.get("hipaa_controls") or []),
    }
    sev_raw = payload.get("severity", "")
    if hasattr(sev_raw, "value"):
        sev_raw = sev_raw.value
    status_raw = payload.get("status", "")
    if hasattr(status_raw, "value"):
        status_raw = status_raw.value
    cloud_raw = payload.get("cloud_provider", "")
    if hasattr(cloud_raw, "value"):
        cloud_raw = cloud_raw.value
    ts = payload.get("timestamp")
    collected = ts.isoformat() if hasattr(ts, "isoformat") else (str(ts) if ts else None)

    out = NormalizedFinding(
        finding_key=_finding_key_from_payload(payload),
        source_engine="shasta",
        external_id=sid,
        scan_run_id=scan_run_id,
        cloud_provider=str(cloud_raw or ""),
        account_scope=str(payload.get("account_id", "")),
        region=str(payload.get("region", "")),
        check_id=check_id,
        title=str(payload.get("title", "")),
        description=str(payload.get("description", "")),
        severity_normalized=_severity_to_cortex(str(sev_raw)),
        compliance_status=str(status_raw or ""),
        resource_type=str(payload.get("resource_type", "")),
        resource_id=str(payload.get("resource_id", "")),
        framework_controls=fw,
        remediation=str(payload.get("remediation", "")),
        collected_at=collected,
        raw_finding=payload,
    )
    return out


def normalized_to_finding(n: NormalizedFinding, obligation_id: str = "NIS2-RM-10") -> Finding:
    """Project normalized row into legacy ``Finding`` for existing connector consumers."""
    return Finding(
        id=(n.external_id or n.finding_key)[:80],
        title=n.title[:200] or n.check_id,
        severity=n.severity_normalized,
        obligation_id=obligation_id,
        source="shasta",
        resource_id=n.resource_id[:500],
        recommendation_id=n.check_id[:80],
    )


@contextmanager
def _aws_env_from_connector(
    access_key_id: str,
    secret_access_key: str,
    region: str,
    session_token: str | None = None,
) -> Any:
    keys = {
        "AWS_ACCESS_KEY_ID": access_key_id,
        "AWS_SECRET_ACCESS_KEY": secret_access_key,
        "AWS_DEFAULT_REGION": region,
    }
    if session_token:
        keys["AWS_SESSION_TOKEN"] = session_token
    saved: dict[str, str | None] = {}
    try:
        for k, v in keys.items():
            saved[k] = os.environ.get(k)
            os.environ[k] = v
        yield
    finally:
        for k, old in saved.items():
            if old is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = old


@contextmanager
def _azure_env_from_connector(tenant_id: str, client_id: str, client_secret: str) -> Any:
    keys = {
        "AZURE_TENANT_ID": tenant_id,
        "AZURE_CLIENT_ID": client_id,
        "AZURE_CLIENT_SECRET": client_secret,
    }
    saved: dict[str, str | None] = {}
    try:
        for k, v in keys.items():
            saved[k] = os.environ.get(k)
            os.environ[k] = v
        yield
    finally:
        for k, old in saved.items():
            if old is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = old


def _run_shasta_aws_sync() -> Any:
    from shasta.aws.client import AWSClient
    from shasta.scanner import run_full_scan

    client = AWSClient(region=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
    client.validate_credentials()
    return run_full_scan(client=client)


def _run_shasta_azure_sync(subscription_id: str, tenant_id: str, region: str = "eastus") -> Any:
    from shasta.azure.client import AzureClient
    from shasta.scanner import run_full_scan

    ac = AzureClient(subscription_id=subscription_id, tenant_id=tenant_id, region=region)
    ac.validate_credentials()
    return run_full_scan(azure_client=ac)


async def run_shasta_scan_for_stored_credentials(
    cloud: Literal["aws", "azure"],
) -> tuple[str, list[NormalizedFinding]]:
    """Run Shasta using credentials from the existing connector credential store; audit start/end."""
    # CI / smoke tests only — deterministic fake findings without cloud credentials or Transilience install.
    if os.getenv("CORTEX_SHASTA_MOCK", "").lower() in ("1", "true", "yes"):
        audit_fabric.log(
            "shasta_scan_mock",
            entity_type="connector",
            entity_id=CONNECTOR_ENTITY,
            payload={"cloud": cloud},
        )
        mock_nf = NormalizedFinding(
            finding_key="cortex-shasta-mock-001",
            source_engine="shasta",
            external_id="mock-finding-1",
            scan_run_id=None,
            cloud_provider=cloud,
            account_scope="mock-account",
            region="mock-region",
            check_id="MOCK-CHECK",
            title="Mock CSPM finding (CORTEX_SHASTA_MOCK)",
            description="Synthetic row for HTTP smoke tests only.",
            severity_normalized="Low",
            compliance_status="fail",
            resource_type="mock",
            resource_id="arn:aws:mock:resource",
            framework_controls={"soc2": ["CC6.1"]},
            remediation="Disable CORTEX_SHASTA_MOCK in production.",
            collected_at=None,
            raw_finding={"mock": True, "cloud": cloud},
        )
        return "mock-engine-scan-id", [mock_nf]

    if cloud == "aws":
        from app.connectors.aws.aws_connector import create_connector_from_store

        connector = create_connector_from_store()
        if not connector:
            raise ValueError("No stored AWS credentials; POST /connectors/aws/connect first.")
        audit_fabric.log(
            "shasta_scan_start",
            entity_type="connector",
            entity_id=CONNECTOR_ENTITY,
            payload={"cloud": "aws", "account_id_hint": connector.account_id[:4] + "..."},
        )

        def _sync_scan() -> Any:
            with _aws_env_from_connector(
                connector.access_key_id,
                connector.secret_access_key,
                connector.region,
                getattr(connector, "session_token", None),
            ):
                return _run_shasta_aws_sync()

        async def _execute() -> Any:
            return await asyncio.to_thread(_sync_scan)

        try:
            scan_result = await _shasta_breaker.execute(_execute)
        except Exception as e:
            audit_fabric.log(
                "shasta_scan_error",
                entity_type="connector",
                entity_id=CONNECTOR_ENTITY,
                payload={"cloud": "aws", "error": str(e)},
            )
            raise
        scan_id = str(getattr(scan_result, "id", "") or "")
        normalized: list[NormalizedFinding] = []
        for f in getattr(scan_result, "findings", []) or []:
            payload = f.model_dump(mode="json") if hasattr(f, "model_dump") else {}
            normalized.append(shasta_finding_payload_to_normalized(scan_id, cast(dict[str, Any], payload)))
        audit_fabric.log(
            "shasta_scan_done",
            entity_type="connector",
            entity_id=CONNECTOR_ENTITY,
            payload={"cloud": "aws", "findings": len(normalized), "scan_id": scan_id},
        )
        return scan_id, normalized

    # azure
    from app.connectors.azure.azure_connector import create_connector_from_store

    connector = create_connector_from_store()
    if not connector:
        raise ValueError("No stored Azure credentials; POST /connectors/azure/connect first.")
    audit_fabric.log(
        "shasta_scan_start",
        entity_type="connector",
        entity_id=CONNECTOR_ENTITY,
        payload={"cloud": "azure", "tenant_hint": connector.tenant_id[:8] + "..."},
    )

    def _sync_scan_az() -> Any:
        with _azure_env_from_connector(connector.tenant_id, connector.client_id, connector.client_secret):
            return _run_shasta_azure_sync(
                subscription_id=connector.subscription_id,
                tenant_id=connector.tenant_id,
                region=getattr(connector, "region", None) or "eastus",
            )

    async def _execute_az() -> Any:
        return await asyncio.to_thread(_sync_scan_az)

    try:
        scan_result = await _shasta_breaker.execute(_execute_az)
    except Exception as e:
        audit_fabric.log(
            "shasta_scan_error",
            entity_type="connector",
            entity_id=CONNECTOR_ENTITY,
            payload={"cloud": "azure", "error": str(e)},
        )
        raise
    scan_id = str(getattr(scan_result, "id", "") or "")
    normalized_az: list[NormalizedFinding] = []
    for f in getattr(scan_result, "findings", []) or []:
        payload = f.model_dump(mode="json") if hasattr(f, "model_dump") else {}
        normalized_az.append(shasta_finding_payload_to_normalized(scan_id, cast(dict[str, Any], payload)))
    audit_fabric.log(
        "shasta_scan_done",
        entity_type="connector",
        entity_id=CONNECTOR_ENTITY,
        payload={"cloud": "azure", "findings": len(normalized_az), "scan_id": scan_id},
    )
    return scan_id, normalized_az
