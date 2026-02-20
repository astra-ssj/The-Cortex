# compliance/pci_dss.py — PCI DSS framework. Pattern from nist_csf.py.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement


def get_pci_dss() -> Framework:
    return Framework(
        jurisdiction="international",
        purpose_tags=["payments", "pci-dss", "cardholder-data"],
        id="pci_dss",
        name="PCI DSS",
        version="4.0",
        controls=[
            Control(
                id="req1",
                name="Install and Maintain Network Security Controls",
                domain="Build and Maintain a Secure Network",
                requirements=[
                    Requirement(
                        id="req1.1",
                        article_ref="Req 1",
                        description="Firewalls and network controls to protect cardholder data.",
                        evidence_types=[EvidenceType(id="network-diagram", name="Network diagram", description="Documented controls")],
                    ),
                ],
            ),
            Control(
                id="req3",
                name="Protect Stored Account Data",
                domain="Protect Cardholder Data",
                requirements=[
                    Requirement(
                        id="req3.1",
                        article_ref="Req 3",
                        description="Protection of stored account data including encryption.",
                        evidence_types=[EvidenceType(id="encryption", name="Encryption evidence", description="Where applicable")],
                    ),
                ],
            ),
        ],
    )
