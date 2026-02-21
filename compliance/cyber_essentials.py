# compliance/cyber_essentials.py — Cyber Essentials v3.1. 5 domains, 18 controls.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement

_E = EvidenceType
_R = Requirement


def _c(cid: str, name: str, domain: str, desc: str) -> Control:
    return Control(
        id=cid,
        name=name,
        domain=domain,
        requirements=[
            _R(
                id=f"{cid}-1",
                article_ref="",
                description=desc,
                evidence_types=[_E(id=f"{cid}-ev", name="Evidence", description="")],
            )
        ],
    )


def get_cyber_essentials() -> Framework:
    """Build and return Cyber Essentials v3.1 — 5 domains, 18 controls."""
    controls: list[Control] = []

    # 1. Boundary Firewalls and Internet Gateways — 4
    domain1 = "Boundary Firewalls and Internet Gateways"
    for cid, name, desc in [
        ("CE-FW-1", "Firewall at boundary", "Firewall or gateway at internet boundary."),
        ("CE-FW-2", "Default deny", "Default deny and allow only required services."),
        ("CE-FW-3", "Firewall rules", "Firewall rules are documented and reviewed."),
        ("CE-FW-4", "Wireless access", "Wireless access is secured and segregated."),
    ]:
        controls.append(_c(cid, name, domain1, desc))

    # 2. Secure Configuration — 4
    domain2 = "Secure Configuration"
    for cid, name, desc in [
        ("CE-SC-1", "Hardening", "Devices are hardened (unnecessary software removed)."),
        ("CE-SC-2", "Admin rights", "Administrator rights are restricted."),
        ("CE-SC-3", "Password policy", "Strong password policy is applied."),
        ("CE-SC-4", "Screen lock", "Screen lock and timeout are configured."),
    ]:
        controls.append(_c(cid, name, domain2, desc))

    # 3. User Access Control — 4
    domain3 = "User Access Control"
    for cid, name, desc in [
        ("CE-UA-1", "User accounts", "User accounts are assigned only to authorized individuals."),
        ("CE-UA-2", "Unique user IDs", "Unique user IDs for each user."),
        ("CE-UA-3", "MFA for admin", "Multi-factor authentication for privileged access."),
        ("CE-UA-4", "Access removal", "Access is removed when no longer required."),
    ]:
        controls.append(_c(cid, name, domain3, desc))

    # 4. Security Update Management — 3
    domain4 = "Security Update Management"
    for cid, name, desc in [
        ("CE-PM-1", "Supported software", "Only supported software in use."),
        ("CE-PM-2", "Patching", "Security updates applied within 14 days."),
        ("CE-PM-3", "Update mechanism", "Update mechanism is enabled and managed."),
    ]:
        controls.append(_c(cid, name, domain4, desc))

    # 5. Malware Protection — 3
    domain5 = "Malware Protection"
    for cid, name, desc in [
        ("CE-MP-1", "Malware protection", "Malware protection is installed and enabled."),
        ("CE-MP-2", "Definition updates", "Malware definitions are kept up to date."),
        ("CE-MP-3", "Restricted execution", "Execution of malware is blocked and quarantined."),
    ]:
        controls.append(_c(cid, name, domain5, desc))

    return Framework(
        jurisdiction="UK",
        purpose_tags=["cybersecurity", "cyber-essentials"],
        id="cyber-essentials-v3.1",
        name="Cyber Essentials v3.1",
        version="3.1",
        controls=controls,
    )
