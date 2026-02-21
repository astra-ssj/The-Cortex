# compliance/eu_cybersecurity_act.py — EU Cybersecurity Act. 4 domains, 22 controls.

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
            Requirement(
                id=f"{cid}-1",
                article_ref="",
                description=desc,
                evidence_types=[_E(id=f"{cid}-ev", name="Evidence", description="")],
            )
        ],
    )


def get_eu_cybersecurity_act() -> Framework:
    """Build and return EU Cybersecurity Act — 4 domains, 22 controls."""
    controls: list[Control] = []

    # 1. Certification Framework — 6
    d1 = "Certification Framework"
    for cid, name, desc in [
        ("ECA-CF-1", "Certification scheme", "EU certification scheme is applied."),
        ("ECA-CF-2", "Assurance level", "Assurance level (basic, substantial, high) is determined."),
        ("ECA-CF-3", "Conformity assessment", "Conformity assessment is performed."),
        ("ECA-CF-4", "Certification body", "Certification is issued by accredited body."),
        ("ECA-CF-5", "Scope of certification", "Scope of certification is defined."),
        ("ECA-CF-6", "Surveillance", "Surveillance of certified products is in place."),
    ]:
        controls.append(_c(cid, name, d1, desc))

    # 2. ENISA Role & Coordination — 5
    d2 = "ENISA Role & Coordination"
    for cid, name, desc in [
        ("ECA-EN-1", "ENISA mandate", "ENISA supports certification framework."),
        ("ECA-EN-2", "European certification group", "Coordination at EU level is ensured."),
        ("ECA-EN-3", "Scheme maintenance", "Certification schemes are maintained."),
        ("ECA-EN-4", "Standards alignment", "Alignment with international standards."),
        ("ECA-EN-5", "Guidance", "Guidance for manufacturers and assessors."),
    ]:
        controls.append(_c(cid, name, d2, desc))

    # 3. Assurance Levels & Requirements — 6
    d3 = "Assurance Levels & Requirements"
    for cid, name, desc in [
        ("ECA-AL-1", "Basic level", "Basic assurance level requirements are met."),
        ("ECA-AL-2", "Substantial level", "Substantial assurance level where required."),
        ("ECA-AL-3", "High level", "High assurance level for critical ICT."),
        ("ECA-AL-4", "Security objectives", "Security objectives are defined."),
        ("ECA-AL-5", "Technical requirements", "Technical requirements are specified."),
        ("ECA-AL-6", "Documentation", "Documentation supports assurance level."),
    ]:
        controls.append(_c(cid, name, d3, desc))

    # 4. Market & Mutual Recognition — 5
    d4 = "Market & Mutual Recognition"
    for cid, name, desc in [
        ("ECA-MM-1", "EU-wide recognition", "Certification is recognised across EU."),
        ("ECA-MM-2", "Public procurement", "Certification supports public procurement."),
        ("ECA-MM-3", "International mutual recognition", "International mutual recognition where applicable."),
        ("ECA-MM-4", "Transparency", "Certification results are transparent."),
        ("ECA-MM-5", "Stakeholder trust", "Stakeholder trust in certified products."),
    ]:
        controls.append(_c(cid, name, d4, desc))

    return Framework(
        jurisdiction="EU",
        purpose_tags=["cybersecurity", "eu", "certification"],
        id="eu-cybersecurity-act",
        name="EU Cybersecurity Act",
        version="1.0",
        controls=controls,
    )
