# compliance/iso27001.py — ISO/IEC 27001 framework. Pattern from nist_csf.py.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement


def get_iso27001() -> Framework:
    return Framework(
        jurisdiction="international",
        purpose_tags=["isms", "iso27001", "security"],
        id="iso27001",
        name="ISO/IEC 27001",
        version="2022",
        controls=[
            Control(
                id="a.5.1",
                name="Policies for Information Security",
                domain="Organizational Controls",
                requirements=[
                    Requirement(
                        id="a.5.1.1",
                        article_ref="A.5.1",
                        description="Policies for information security shall be defined and approved.",
                        evidence_types=[EvidenceType(id="policy", name="ISMS policy", description="Approved policy")],
                    ),
                ],
            ),
            Control(
                id="a.8.1",
                name="Inventory of Assets",
                domain="Technological Controls",
                requirements=[
                    Requirement(
                        id="a.8.1.1",
                        article_ref="A.8.1",
                        description="Assets associated with information and information processing facilities shall be identified.",
                        evidence_types=[EvidenceType(id="inventory", name="Asset inventory", description="Inventory register")],
                    ),
                ],
            ),
        ],
    )
