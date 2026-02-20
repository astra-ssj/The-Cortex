# compliance/soc2.py — SOC 2 Type II framework. Pattern from nist_csf.py.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement


def get_soc2() -> Framework:
    return Framework(
        jurisdiction="US",
        purpose_tags=["audit", "soc2", "trust-services"],
        id="soc2",
        name="SOC 2 Type II",
        version="1.0",
        controls=[
            Control(
                id="cc6.1",
                name="Logical and Physical Access Controls",
                domain="Common Criteria",
                requirements=[
                    Requirement(
                        id="cc6.1-1",
                        article_ref="",
                        description="Implement logical and physical access controls.",
                        evidence_types=[EvidenceType(id="access-policy", name="Access policy", description="Documented controls")],
                    ),
                ],
            ),
            Control(
                id="cc7.1",
                name="System Operations",
                domain="Common Criteria",
                requirements=[
                    Requirement(
                        id="cc7.1-1",
                        article_ref="",
                        description="Detect and respond to security events.",
                        evidence_types=[EvidenceType(id="monitoring", name="Monitoring evidence", description="Logs and alerts")],
                    ),
                ],
            ),
        ],
    )
