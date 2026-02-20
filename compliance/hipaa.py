# compliance/hipaa.py — HIPAA framework. Pattern from nist_csf.py.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement


def get_hipaa() -> Framework:
    return Framework(
        jurisdiction="US",
        purpose_tags=["healthcare", "hipaa", "phi"],
        id="hipaa",
        name="HIPAA Security Rule",
        version="1.0",
        controls=[
            Control(
                id="sec-164.308",
                name="Administrative Safeguards",
                domain="Administrative",
                requirements=[
                    Requirement(
                        id="164.308-a1",
                        article_ref="164.308(a)(1)",
                        description="Security management process: implement policies and procedures.",
                        evidence_types=[EvidenceType(id="risk-analysis", name="Risk analysis", description="Documented analysis")],
                    ),
                ],
            ),
            Control(
                id="sec-164.312",
                name="Technical Safeguards",
                domain="Technical",
                requirements=[
                    Requirement(
                        id="164.312-a1",
                        article_ref="164.312(a)(1)",
                        description="Access control: unique user identification and procedures.",
                        evidence_types=[EvidenceType(id="access-controls", name="Access control evidence", description="Technical and procedural")],
                    ),
                ],
            ),
        ],
    )
