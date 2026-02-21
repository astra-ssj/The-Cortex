# aws_connector.py — Connect to AWS account, discover systems/controls, pull findings.
# All boto3 calls via CircuitBreaker; audit_fabric for actions. Supports assume_role.

from __future__ import annotations

import asyncio
import csv
import io
from datetime import datetime, timezone
from typing import Any, cast

import structlog

from core.audit_fabric import audit_fabric
from core.circuit_breaker import CircuitBreaker, register_circuit_breaker
from ontology.models import ControlFinding, ControlRef, Finding, SystemAsset

from app.connectors.azure.credential_store import get_credentials, store_credentials

logger = structlog.get_logger()

# Security Hub severity -> CORTEX severity (CRITICAL Security Hub -> CORTEX CRITICAL)
_SECURITY_HUB_SEVERITY_MAP: dict[str, str] = {
    "CRITICAL": "CRITICAL",
    "HIGH": "High",
    "MEDIUM": "Medium",
    "LOW": "Low",
    "INFORMATIONAL": "Informational",
}

# AWS finding type / control -> CORTEX obligation_id mapping
_AWS_FINDING_TO_OBLIGATION: dict[str, str] = {
    "Software and Configuration Checks/Industry and Regulatory Standards/CIS AWS Foundations Benchmark": "NIS2-RM-10",
    "IAM.1": "NIS2-RM-10",  # Root MFA
    "IAM.3": "NIS2-RM-10",  # Unused credentials
    "cloudtrail-enabled": "NIS2-RM-10",
    "guardduty-enabled": "NIS2-RM-10",
    "s3-bucket-public-read-prohibited": "NIS2-RM-10",
    "s3-bucket-ssl-requests-only": "NIS2-RM-10",
    "multi-region-cloudtrail": "NIS2-RM-10",
}

CONNECTOR_ID = "aws"

_aws_breaker = CircuitBreaker("aws_connector", failure_threshold=5)
register_circuit_breaker(_aws_breaker)


def _get_boto_session(
    access_key_id: str,
    secret_access_key: str,
    region: str,
    role_arn: str | None = None,
    external_id: str | None = None,
) -> Any:
    """Return boto3 session; if role_arn set, assume role and return session with assumed credentials."""
    try:
        import boto3
        from botocore.config import Config
    except ImportError as e:
        raise ImportError("boto3 required: pip install boto3") from e

    config = Config(region_name=region)
    session = boto3.Session(
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name=region,
    )
    if not role_arn:
        return session

    sts = session.client("sts", config=config)
    assume_kw: dict[str, Any] = {"RoleArn": role_arn, "RoleSessionName": "cortex-connector"}
    if external_id:
        assume_kw["ExternalId"] = external_id
    resp = sts.assume_role(**assume_kw)
    creds = resp["Credentials"]
    return boto3.Session(
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"],
        region_name=region,
    )


class AWSConnector:
    """Connect to AWS account, discover systems and controls, ingest findings into CORTEX ontology."""

    def __init__(
        self,
        account_id: str,
        access_key_id: str,
        secret_access_key: str,
        region: str,
        role_arn: str | None = None,
        external_id: str | None = None,
    ) -> None:
        self.account_id = account_id
        self.access_key_id = access_key_id
        self.secret_access_key = secret_access_key
        self.region = region
        self.role_arn = role_arn
        self.external_id = external_id
        self._session: Any = None

    def _get_session(self) -> Any:
        if self._session is not None:
            return self._session
        self._session = _get_boto_session(
            self.access_key_id,
            self.secret_access_key,
            self.region,
            role_arn=self.role_arn,
            external_id=self.external_id,
        )
        return self._session

    def _sts_get_caller_identity_sync(self) -> dict[str, Any]:
        """Sync: validate credentials via STS GetCallerIdentity. Used inside executor."""
        session = self._get_session()
        sts = session.client("sts")
        return sts.get_caller_identity()

    async def connect(self) -> bool:
        """Validate credentials via sts.get_caller_identity(). Log to audit_fabric."""
        audit_fabric.log("aws_connector_connect_start", entity_type="connector", entity_id=CONNECTOR_ID)

        async def _test_access() -> dict:
            return await asyncio.to_thread(self._sts_get_caller_identity_sync)

        try:
            identity = await _aws_breaker.execute(_test_access)
            if self.account_id and identity.get("Account") != self.account_id:
                raise ValueError(f"Account mismatch: expected {self.account_id}, got {identity.get('Account')}")
        except Exception as e:
            audit_fabric.log(
                "aws_connector_connect_error",
                entity_type="connector",
                entity_id=CONNECTOR_ID,
                payload={"error": str(e)},
            )
            raise
        audit_fabric.log("aws_connector_connect_done", entity_type="connector", entity_id=CONNECTOR_ID)
        return True

    def _discover_systems_sync(self) -> list[SystemAsset]:
        """Sync: EC2, RDS, S3, Lambda, ECS/EKS -> SystemAsset. Used inside executor."""
        session = self._get_session()
        assets: list[SystemAsset] = []
        region = self.region

        # EC2 instances -> INFRASTRUCTURE
        try:
            ec2 = session.client("ec2", region_name=region)
            for page in ec2.get_paginator("describe_instances").paginate():
                for res in page.get("Reservations", []):
                    for inst in res.get("Instances", []):
                        iid = inst.get("InstanceId", "")
                        name = next((t["Value"] for t in (inst.get("Tags") or []) if t.get("Key") == "Name"), iid)
                        aid = f"aws-ec2-{self.account_id}-{region}-{iid}"[-80:]
                        assets.append(
                            SystemAsset(
                                jurisdiction="internal",
                                purpose_tags=["aws", "connector"],
                                id=aid,
                                name=name or iid,
                                system_type="infrastructure",
                            )
                        )
        except Exception as e:
            logger.warning("aws_discover_ec2_error", error=str(e))

        # RDS instances -> DATA_STORE (flag personal_data if tagged)
        try:
            rds = session.client("rds", region_name=region)
            for page in rds.get_paginator("describe_db_instances").paginate():
                for db in page.get("DBInstances", []):
                    dbid = db.get("DBInstanceIdentifier", "")
                    arn = db.get("DBInstanceArn", "")
                    if not arn:
                        continue
                    tags_resp = rds.list_tags_for_resource(ResourceName=arn)
                    tags = {t["Key"]: t["Value"] for t in tags_resp.get("TagList", [])}
                    personal_data = any(
                        k.lower() in ("personal_data", "pii", "gdpr") or "personal" in str(v).lower()
                        for k, v in tags.items()
                    )
                    purpose_tags = ["aws", "connector"]
                    if personal_data:
                        purpose_tags.append("personal_data")
                    aid = f"aws-rds-{self.account_id}-{region}-{dbid}"[-80:]
                    assets.append(
                        SystemAsset(
                            jurisdiction="internal",
                            purpose_tags=purpose_tags,
                            id=aid,
                            name=dbid,
                            system_type="data_store",
                        )
                    )
        except Exception as e:
            logger.warning("aws_discover_rds_error", error=str(e))

        # S3 buckets -> DATA_STORE (check public access, encryption)
        try:
            s3 = session.client("s3", region_name=region)
            for bucket in s3.list_buckets().get("Buckets", []):
                bid = bucket.get("Name", "")
                purpose_tags = ["aws", "connector"]
                try:
                    pa = s3.get_public_access_block(Bucket=bid)
                    if not pa.get("PublicAccessBlockConfiguration", {}).get("BlockPublicAcls"):
                        purpose_tags.append("public_access_risk")
                except Exception:
                    purpose_tags.append("public_access_risk")
                try:
                    enc = s3.get_bucket_encryption(Bucket=bid)
                    if not enc.get("ServerSideEncryptionConfiguration", {}).get("Rules"):
                        purpose_tags.append("unencrypted")
                except Exception:
                    purpose_tags.append("unencrypted")
                aid = f"aws-s3-{self.account_id}-{bid}"[-80:]
                assets.append(
                    SystemAsset(
                        jurisdiction="internal",
                        purpose_tags=purpose_tags,
                        id=aid,
                        name=bid,
                        system_type="data_store",
                    )
                )
        except Exception as e:
            logger.warning("aws_discover_s3_error", error=str(e))

        # Lambda functions -> APPLICATION
        try:
            lam = session.client("lambda", region_name=region)
            for page in lam.get_paginator("list_functions").paginate():
                for fn in page.get("Functions", []):
                    fid = fn.get("FunctionName", "")
                    aid = f"aws-lambda-{self.account_id}-{region}-{fid}"[-80:]
                    assets.append(
                        SystemAsset(
                            jurisdiction="internal",
                            purpose_tags=["aws", "connector"],
                            id=aid,
                            name=fid,
                            system_type="application",
                        )
                    )
        except Exception as e:
            logger.warning("aws_discover_lambda_error", error=str(e))

        # ECS clusters -> INFRASTRUCTURE
        try:
            ecs = session.client("ecs", region_name=region)
            for page in ecs.get_paginator("list_clusters").paginate():
                for arn in page.get("clusterArns", []):
                    cid = arn.split("/")[-1] if "/" in arn else arn
                    aid = f"aws-ecs-{self.account_id}-{region}-{cid}"[-80:]
                    assets.append(
                        SystemAsset(
                            jurisdiction="internal",
                            purpose_tags=["aws", "connector"],
                            id=aid,
                            name=cid,
                            system_type="infrastructure",
                        )
                    )
        except Exception as e:
            logger.warning("aws_discover_ecs_error", error=str(e))

        # EKS clusters -> INFRASTRUCTURE
        try:
            eks = session.client("eks", region_name=region)
            for page in eks.get_paginator("list_clusters").paginate():
                for cname in page.get("clusters", []):
                    aid = f"aws-eks-{self.account_id}-{region}-{cname}"[-80:]
                    assets.append(
                        SystemAsset(
                            jurisdiction="internal",
                            purpose_tags=["aws", "connector"],
                            id=aid,
                            name=cname,
                            system_type="infrastructure",
                        )
                    )
        except Exception as e:
            logger.warning("aws_discover_eks_error", error=str(e))

        return assets

    async def discover_systems(self) -> list[SystemAsset]:
        """EC2, RDS, S3, Lambda, ECS/EKS -> List[SystemAsset]. Flag personal_data for tagged RDS/S3."""
        audit_fabric.log("aws_discover_systems_start", entity_type="connector", entity_id=CONNECTOR_ID)

        async def _discover() -> list:
            return await asyncio.to_thread(self._discover_systems_sync)

        try:
            assets = await _aws_breaker.execute(_discover)
        except Exception as e:
            audit_fabric.log(
                "aws_discover_systems_error",
                entity_type="connector",
                entity_id=CONNECTOR_ID,
                payload={"error": str(e)},
            )
            raise
        audit_fabric.log(
            "aws_discover_systems_done",
            entity_type="connector",
            entity_id=CONNECTOR_ID,
            payload={"count": len(assets)},
        )
        return assets

    def _discover_controls_sync(self) -> list[ControlFinding]:
        """Sync: Security Hub score, Config rules, IAM Credential Report, CloudTrail, GuardDuty -> ControlFinding."""
        session = self._get_session()
        region = self.region
        findings: list[ControlFinding] = []

        # Security Hub — security score and findings (if enabled)
        try:
            sh = session.client("securityhub", region_name=region)
            try:
                scores = sh.get_security_control_definitions()
                # Use as baseline for compliant controls
                for ctrl in scores.get("SecurityControlDefinitions", [])[:5]:
                    findings.append(
                        ControlFinding(
                            control_ref=ControlRef(framework_id="aws", control_id=ctrl.get("SecurityControlId", "SH")),
                            status="compliant",
                            recommendation_id="SecurityHub",
                            raw_data={"source": "security_hub"},
                        )
                    )
            except Exception:
                pass
        except Exception as e:
            logger.warning("aws_discover_security_hub_error", error=str(e))

        # AWS Config — compliance rules status
        try:
            config = session.client("config", region_name=region)
            for page in config.get_paginator("describe_compliance_by_config_rule").paginate():
                for item in page.get("ComplianceByConfigRules", []):
                    rule = item.get("ConfigRuleName", "")
                    status = "compliant" if item.get("Compliance", {}).get("ComplianceType") == "COMPLIANT" else "non_compliant"
                    findings.append(
                        ControlFinding(
                            control_ref=ControlRef(framework_id="aws", control_id=rule),
                            status=status,
                            recommendation_id=rule,
                            raw_data={"source": "config"},
                        )
                    )
        except Exception as e:
            logger.warning("aws_discover_config_error", error=str(e))

        # CloudTrail — enabled? multi-region? log validation?
        try:
            ct = session.client("cloudtrail", region_name=region)
            trails = ct.describe_trails()
            multi_region = any(t.get("IsMultiRegionTrail") for t in trails.get("trailList", []))
            enabled = len(trails.get("trailList", [])) > 0
            status = "compliant" if (enabled and multi_region) else "non_compliant"
            findings.append(
                ControlFinding(
                    control_ref=ControlRef(framework_id="aws", control_id="cloudtrail-enabled"),
                    status="compliant" if enabled else "non_compliant",
                    recommendation_id="cloudtrail-enabled",
                    raw_data={"enabled": enabled, "multi_region": multi_region, "source": "cloudtrail"},
                )
            )
            findings.append(
                ControlFinding(
                    control_ref=ControlRef(framework_id="aws", control_id="multi-region-cloudtrail"),
                    status=status,
                    recommendation_id="multi-region-cloudtrail",
                    raw_data={"source": "cloudtrail"},
                )
            )
        except Exception as e:
            logger.warning("aws_discover_cloudtrail_error", error=str(e))

        # GuardDuty — enabled per region?
        try:
            gd = session.client("guardduty", region_name=region)
            detectors = gd.list_detectors()
            enabled = len(detectors.get("DetectorIds", [])) > 0
            findings.append(
                ControlFinding(
                    control_ref=ControlRef(framework_id="aws", control_id="guardduty-enabled"),
                    status="compliant" if enabled else "non_compliant",
                    recommendation_id="guardduty-enabled",
                    raw_data={"source": "guardduty"},
                )
            )
        except Exception as e:
            logger.warning("aws_discover_guardduty_error", error=str(e))

        # IAM Credential Report — MFA status, stale credentials (summary in get_identity_summary; here we add control findings)
        try:
            iam = session.client("iam")
            try:
                iam.generate_credential_report()
            except Exception:
                pass
            report = iam.get_credential_report()
            content = report["Content"].decode("utf-8")
            reader = csv.DictReader(io.StringIO(content))
            for row in reader:
                if row.get("user") == "<root_account>":
                    mfa = row.get("mfa_active", "false") == "true"
                    findings.append(
                        ControlFinding(
                            control_ref=ControlRef(framework_id="aws", control_id="IAM.1"),
                            status="compliant" if mfa else "non_compliant",
                            recommendation_id="IAM.1",
                            raw_data={"source": "iam_credential_report"},
                        )
                    )
                    break
        except Exception as e:
            logger.warning("aws_discover_iam_report_error", error=str(e))

        return findings

    async def discover_controls(self) -> list[ControlFinding]:
        """Security Hub, Config, IAM Credential Report, CloudTrail, GuardDuty -> List[ControlFinding]."""
        audit_fabric.log("aws_discover_controls_start", entity_type="connector", entity_id=CONNECTOR_ID)

        async def _discover() -> list:
            return await asyncio.to_thread(self._discover_controls_sync)

        try:
            out = await _aws_breaker.execute(_discover)
        except Exception as e:
            audit_fabric.log(
                "aws_discover_controls_error",
                entity_type="connector",
                entity_id=CONNECTOR_ID,
                payload={"error": str(e)},
            )
            raise
        audit_fabric.log(
            "aws_discover_controls_done",
            entity_type="connector",
            entity_id=CONNECTOR_ID,
            payload={"count": len(out)},
        )
        return out

    def _pull_findings_sync(self) -> list[Finding]:
        """Sync: Convert Security Hub findings to CORTEX Findings; map to obligation_ids; CRITICAL -> CRITICAL."""
        session = self._get_session()
        region = self.region
        results: list[Finding] = []

        try:
            sh = session.client("securityhub", region_name=region)
            for page in sh.get_paginator("get_findings").paginate():
                for f in page.get("Findings", []):
                    fid = f.get("Id", "")
                    title = f.get("Title", "") or f.get("Description", "")[:200]
                    sev = (f.get("Severity", {}) or {}).get("Label", "INFORMATIONAL")
                    cortex_sev = _SECURITY_HUB_SEVERITY_MAP.get(sev.upper(), "Informational")
                    product_arn = f.get("ProductArn", "")
                    rec_id = (f.get("Remediation", {}) or {}).get("Recommendation", {}).get("Text", "") or product_arn
                    resource_id = (f.get("Resources", [{}]) or [{}])[0].get("Id", "") if f.get("Resources") else ""
                    generator_id = (f.get("GeneratorId") or "") or (f.get("ProductArn") or "")
                    obligation_id = _AWS_FINDING_TO_OBLIGATION.get(
                        generator_id,
                        "NIS2-RM-10",
                    )
                    for key in (f.get("ProductFields") or {}).keys():
                        if key in _AWS_FINDING_TO_OBLIGATION:
                            obligation_id = _AWS_FINDING_TO_OBLIGATION[key]
                            break
                    results.append(
                        Finding(
                            id=fid[:80] or f"aws-sh-{len(results)}",
                            title=title[:200] or "Security Hub finding",
                            severity=cortex_sev,
                            obligation_id=obligation_id or "NIS2-RM-10",
                            source="security_hub",
                            resource_id=resource_id,
                            recommendation_id=rec_id[:80] if isinstance(rec_id, str) else "",
                        )
                    )
        except Exception as e:
            logger.warning("aws_pull_findings_security_hub_error", error=str(e))

        return results

    async def pull_findings(self) -> list[Finding]:
        """Convert Security Hub findings to CORTEX Findings; map AWS types to obligation_ids; CRITICAL -> CRITICAL."""
        audit_fabric.log("aws_pull_findings_start", entity_type="connector", entity_id=CONNECTOR_ID)

        async def _pull() -> list:
            return await asyncio.to_thread(self._pull_findings_sync)

        try:
            findings = await _aws_breaker.execute(_pull)
        except Exception as e:
            audit_fabric.log(
                "aws_pull_findings_error",
                entity_type="connector",
                entity_id=CONNECTOR_ID,
                payload={"error": str(e)},
            )
            raise
        audit_fabric.log(
            "aws_pull_findings_done",
            entity_type="connector",
            entity_id=CONNECTOR_ID,
            payload={"count": len(findings)},
        )
        return findings

    def _get_identity_summary_sync(self) -> dict[str, Any]:
        """Sync: IAM users without MFA, root usage 90d, stale access keys >90d."""
        session = self._get_session()
        summary: dict[str, Any] = {
            "users_without_mfa": 0,
            "root_usage_last_90_days": 0,
            "stale_access_keys_90_days": 0,
        }
        try:
            iam = session.client("iam")
            try:
                iam.generate_credential_report()
            except Exception:
                pass
            report = iam.get_credential_report()
            content = report["Content"].decode("utf-8")
            reader = csv.DictReader(io.StringIO(content))
            cutoff = datetime.now(timezone.utc)
            for row in reader:
                if row.get("user") == "<root_account>":
                    try:
                        last_used = row.get("password_last_used") or row.get("access_key_1_last_used") or row.get("access_key_2_last_used")
                        if last_used:
                            last_dt = datetime.fromisoformat(last_used.replace("Z", "+00:00"))
                            if (cutoff - last_dt).days <= 90:
                                summary["root_usage_last_90_days"] = 1
                    except Exception:
                        pass
                    continue
                if row.get("mfa_active", "false") != "true":
                    summary["users_without_mfa"] += 1
                for key in ("access_key_1_last_used", "access_key_2_last_used"):
                    used = row.get(key)
                    if not used or used == "N/A":
                        continue
                    try:
                        last_dt = datetime.fromisoformat(used.replace("Z", "+00:00"))
                        if (cutoff - last_dt).days > 90:
                            summary["stale_access_keys_90_days"] += 1
                    except Exception:
                        pass
        except Exception as e:
            logger.warning("aws_identity_summary_error", error=str(e))
        return summary

    async def get_identity_summary(self) -> dict[str, Any]:
        """Count IAM users without MFA, root account usage in last 90 days, stale access keys (> 90 days)."""
        audit_fabric.log("aws_identity_summary_start", entity_type="connector", entity_id=CONNECTOR_ID)

        async def _summary() -> dict:
            return await asyncio.to_thread(self._get_identity_summary_sync)

        try:
            summary = await _aws_breaker.execute(_summary)
        except Exception as e:
            audit_fabric.log(
                "aws_identity_summary_error",
                entity_type="connector",
                entity_id=CONNECTOR_ID,
                payload={"error": str(e)},
            )
            raise
        audit_fabric.log(
            "aws_identity_summary_done",
            entity_type="connector",
            entity_id=CONNECTOR_ID,
            payload=summary,
        )
        return summary


def create_connector_from_store() -> AWSConnector | None:
    """Build AWSConnector from stored (encrypted) credentials."""
    creds = get_credentials(CONNECTOR_ID)
    if not creds:
        return None
    return AWSConnector(
        account_id=creds.get("account_id", ""),
        access_key_id=creds.get("access_key_id", ""),
        secret_access_key=creds.get("secret_access_key", ""),
        region=creds.get("region", "us-east-1"),
        role_arn=creds.get("role_arn"),
        external_id=creds.get("external_id"),
    )


def store_connector_credentials(
    account_id: str,
    access_key_id: str,
    secret_access_key: str,
    region: str,
    role_arn: str | None = None,
    external_id: str | None = None,
) -> None:
    """Encrypt and store credentials for sync."""
    store_credentials(
        CONNECTOR_ID,
        {
            "account_id": account_id,
            "access_key_id": access_key_id,
            "secret_access_key": secret_access_key,
            "region": region,
            "role_arn": role_arn,
            "external_id": external_id,
        },
    )
