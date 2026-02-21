# compliance/eu_ai_act.py — EU AI Act 2024. 6 domains, 31 controls.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement

_E = EvidenceType
_R = Requirement


def _c(cid: str, name: str, domain: str, desc: str, article: str = "") -> Control:
    return Control(
        id=cid,
        name=name,
        domain=domain,
        requirements=[
            Requirement(
                id=f"{cid}-1",
                article_ref=article,
                description=desc,
                evidence_types=[_E(id=f"{cid}-ev", name="Evidence", description="")],
            )
        ],
    )


def get_eu_ai_act() -> Framework:
    """Build and return EU AI Act 2024 — 6 domains, 31 controls."""
    controls: list[Control] = []

    # 1. Prohibited AI Practices — 5
    d1 = "Prohibited AI Practices"
    for cid, name, desc, art in [
        ("AI-P-1", "Prohibited practices", "AI systems deploying prohibited practices are not placed on the market.", "Art.5"),
        ("AI-P-2", "Subliminal manipulation", "Subliminal techniques beyond awareness are not used.", "Art.5(1)(a)"),
        ("AI-P-3", "Exploitation of vulnerabilities", "Exploitation of vulnerabilities is not used.", "Art.5(1)(b)"),
        ("AI-P-4", "Social scoring", "Social scoring for general purpose is not used.", "Art.5(1)(c)"),
        ("AI-P-5", "Real-time biometric", "Real-time remote biometric in publicly accessible spaces is limited.", "Art.5(1)(d)"),
    ]:
        controls.append(_c(cid, name, d1, desc, art))

    # 2. Risk Management — 6
    d2 = "Risk Management"
    for cid, name, desc, art in [
        ("AI-RM-1", "Risk management system", "Risk management system is established and maintained.", "Art.9"),
        ("AI-RM-2", "Identification of risks", "Risks are identified and analysed.", "Art.9"),
        ("AI-RM-3", "Residual risk evaluation", "Residual risk is evaluated and accepted.", "Art.9"),
        ("AI-RM-4", "Post-market monitoring", "Post-market monitoring is in place.", "Art.72"),
        ("AI-RM-5", "Serious incident reporting", "Serious incidents are reported to authorities.", "Art.73"),
        ("AI-RM-6", "Risk management updates", "Risk management is updated throughout lifecycle.", "Art.9"),
    ]:
        controls.append(_c(cid, name, d2, desc, art))

    # 3. Data Governance — 5
    d3 = "Data Governance"
    for cid, name, desc, art in [
        ("AI-DG-1", "Training data quality", "Training data meets quality criteria.", "Art.10"),
        ("AI-DG-2", "Data relevance", "Data is relevant and representative.", "Art.10"),
        ("AI-DG-3", "Bias and discrimination", "Bias and discrimination are addressed.", "Art.10"),
        ("AI-DG-4", "Data governance", "Data governance and management practices.", "Art.10"),
        ("AI-DG-5", "Synthetic data", "Use of synthetic data is documented.", "Art.10"),
    ]:
        controls.append(_c(cid, name, d3, desc, art))

    # 4. Transparency & Human Oversight — 6
    d4 = "Transparency & Human Oversight"
    for cid, name, desc, art in [
        ("AI-TH-1", "Transparency to users", "Users are informed they interact with AI.", "Art.50"),
        ("AI-TH-2", "Human oversight", "Human oversight is ensured.", "Art.14"),
        ("AI-TH-3", "Interpretability", "Interpretability and explainability are addressed.", "Art.13"),
        ("AI-TH-4", "Documentation", "Technical documentation is maintained.", "Art.11"),
        ("AI-TH-5", "Record-keeping", "Logs and record-keeping are in place.", "Art.12"),
        ("AI-TH-6", "Instructions for use", "Instructions for use are provided.", "Art.11"),
    ]:
        controls.append(_c(cid, name, d4, desc, art))

    # 5. Accuracy & Robustness — 5
    d5 = "Accuracy & Robustness"
    for cid, name, desc, art in [
        ("AI-AR-1", "Accuracy and robustness", "Accuracy and robustness are achieved.", "Art.15"),
        ("AI-AR-2", "Resilience to attacks", "Resilience to adversarial attacks.", "Art.15"),
        ("AI-AR-3", "Cybersecurity", "Cybersecurity is addressed.", "Art.15"),
        ("AI-AR-4", "Validation and testing", "Validation and testing are performed.", "Art.15"),
        ("AI-AR-5", "Performance metrics", "Performance metrics are defined and monitored.", "Art.15"),
    ]:
        controls.append(_c(cid, name, d5, desc, art))

    # 6. Conformity & Compliance — 4
    d6 = "Conformity & Compliance"
    for cid, name, desc, art in [
        ("AI-CC-1", "Conformity assessment", "Conformity assessment is carried out.", "Art.43"),
        ("AI-CC-2", "CE marking", "CE marking and declaration of conformity.", "Art.47"),
        ("AI-CC-3", "Registration", "High-risk AI systems are registered.", "Art.51"),
        ("AI-CC-4", "Compliance with obligations", "Obligations under the Regulation are met.", "Art.16"),
    ]:
        controls.append(_c(cid, name, d6, desc, art))

    return Framework(
        jurisdiction="EU",
        purpose_tags=["ai", "eu-ai-act", "regulation"],
        id="eu-ai-act-2024",
        name="EU AI Act 2024",
        version="2024",
        controls=controls,
    )
