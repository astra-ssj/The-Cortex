# compliance/nist_csf.py — NIST CSF framework definition.
# Reference pattern for all compliance frameworks: build Framework with Controls and Requirements,
# each Requirement with at least one EvidenceType. Register in registry.py.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement


def get_nist_csf() -> Framework:
    """Build and return the NIST Cybersecurity Framework. Same structure as gdpr.get_gdpr()."""
    return Framework(
        jurisdiction="US",
        purpose_tags=["cybersecurity", "nist", "csf"],
        id="nist_csf",
        name="NIST Cybersecurity Framework",
        version="2.0",
        controls=[
            Control(
                id="gov",
                name="Govern",
                domain="Govern",
                requirements=[
                    Requirement(
                        id="gov-1",
                        article_ref="",
                        description="Establish and communicate cybersecurity governance.",
                        evidence_types=[
                            EvidenceType(id="policy", name="Policy document", description="Written policy"),
                            EvidenceType(id="review", name="Review record", description="Review evidence"),
                        ],
                    ),
                ],
            ),
            Control(
                id="identify",
                name="Identify",
                domain="Identify",
                requirements=[
                    Requirement(
                        id="id-1",
                        article_ref="",
                        description="Asset management and identification.",
                        evidence_types=[
                            EvidenceType(id="inventory", name="Asset inventory", description="List of assets"),
                        ],
                    ),
                ],
            ),
        ],
    )
