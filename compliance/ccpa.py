# compliance/ccpa.py — CCPA/CPRA framework. Pattern from nist_csf.py.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement


def get_ccpa() -> Framework:
    return Framework(
        jurisdiction="US",
        purpose_tags=["privacy", "ccpa", "california"],
        id="ccpa",
        name="California Consumer Privacy Act (CCPA/CPRA)",
        version="1.0",
        controls=[
            Control(
                id="right-to-know",
                name="Right to Know",
                domain="Consumer Rights",
                requirements=[
                    Requirement(
                        id="rtk-1",
                        article_ref="1798.100",
                        description="Disclosure of categories and specific pieces of personal information collected.",
                        evidence_types=[EvidenceType(id="disclosure", name="Disclosure documentation", description="Privacy notice and processes")],
                    ),
                ],
            ),
            Control(
                id="right-to-delete",
                name="Right to Delete",
                domain="Consumer Rights",
                requirements=[
                    Requirement(
                        id="rtd-1",
                        article_ref="1798.105",
                        description="Right to delete personal information with limited exceptions.",
                        evidence_types=[EvidenceType(id="deletion-process", name="Deletion process", description="Documented process and logs")],
                    ),
                ],
            ),
        ],
    )
