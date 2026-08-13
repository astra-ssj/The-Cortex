import type { SnapshotVariant } from "../components/help/PageSnapshot";

export type HelpDocStep = {
  title: string;
  body: string;
  snapshot?: SnapshotVariant;
  snapshotCaption?: string;
  tips?: string[];
};

export type HelpDocSection = {
  id: string;
  title: string;
  intro?: string;
  steps: HelpDocStep[];
};

export const HELP_DOC_SECTIONS: HelpDocSection[] = [
  {
    id: "overview",
    title: "What is the CORTEX Learning Platform?",
    intro:
      "CORTEX is a case-based GRC competency training platform. It presents realistic security and compliance scenarios drawn from ISO 27001:2022 and other frameworks, grades your decisions against a reference answer, and tracks your competency across four independent dimensions. The goal is judgment under pressure — not recall.",
    steps: [
      {
        title: "Who should use it",
        body:
          "Security leads, GRC practitioners, compliance officers, and risk managers who want to build and verify decision-making competency in realistic scenarios. Also used for team training and new-hire onboarding into GRC roles.",
      },
      {
        title: "How it differs from a course",
        body:
          "CORTEX does not test knowledge recall. It tests judgment — whether you make the right decision when a stakeholder is pressing you, the clock is running, and the correct answer is not obvious. Every scenario has a reference answer grounded in a specific framework control, with the rationale visible after your decision.",
        tips: [
          "Scenarios are graded, not just presented.",
          "Four competency dimensions update independently.",
          "Wrong answers cost different amounts depending on how wrong they are.",
        ],
      },
    ],
  },
  {
    id: "how-it-works",
    title: "1. How It Works",
    steps: [
      {
        title: "The scenario loop",
        body:
          "Each scenario has 2-4 decision stages. At each stage you read an agent turn, see the stakeholder's demands, and choose from 3-4 options. After your choice, the agent responds, the next stage opens, and your competency panel updates. The loop ends at the terminal stage.",
        tips: [
          "The agent's demands are pressure, not instructions.",
          "The competency panel only appears after your first decision.",
          "You cannot go back — decisions are final per stage.",
        ],
      },
      {
        title: "Grading",
        body:
          "Each choice is scored against a reference answer stored in the platform. The reference answer is the choice that best satisfies the applicable framework control. After your decision, the observation text in the competency panel cites the specific control your decision satisfied or violated.",
      },
      {
        title: "Starting a new scenario",
        body:
          "If you have an active session, the scenario workspace opens automatically. To start a different scenario, use the reset option to clear your session and return to the selector.",
      },
    ],
  },
  {
    id: "competency",
    title: "2. Competency Dimensions",
    intro:
      "Four dimensions are scored independently. A strong decision on control mapping does not compensate for poor escalation judgment — each dimension reflects a distinct failure mode.",
    steps: [
      {
        title: "Control Mapping",
        body:
          "Can you identify the right control for the situation? Scored at every decision stage. The observation cites the specific Annex A control or framework clause your decision satisfied or violated.",
      },
      {
        title: "Evidence Quality",
        body:
          "Are your decisions supportable by documented evidence? A single wrong answer reflects a misjudgment. Repeated wrong answers on the same scenario incur an additional penalty — that pattern suggests you are not grounding decisions in evidence.",
      },
      {
        title: "Escalation Judgment",
        body:
          "Do you seek more information before committing under uncertainty? Challenging and demanding justification scores highest. Approving everything without scrutiny scores worst. This dimension measures information-seeking behaviour, not just the final decision.",
      },
      {
        title: "Remediation",
        body:
          "Can you scope corrective action correctly once a situation has escalated? This dimension only moves at the escalation stage and later — it is not scored on the opening decision. Expert scenarios weight remediation more heavily.",
      },
    ],
  },
  {
    id: "scenarios",
    title: "3. Scenario Library",
    intro: "All current scenarios cover ISO 27001:2022. Additional frameworks will be added in future tracks.",
    steps: [
      {
        title: "CX-1001 · Foundation",
        body:
          "Friday Cutover: Privileged Cloud Access Request. A DevOps Lead needs broad cloud access before a production cutover. Tests A.8.2, A.5.18, A.5.15. Two decision stages: access_request, escalation.",
      },
      {
        title: "CX-1002 · Practitioner",
        body:
          "Third-Party Breach: Supplier Security Incident. Your SaaS HR provider reports a breach affecting 340 employee records. Tests A.5.19, A.5.20, A.5.26, A.5.28. 72-hour GDPR clock running.",
      },
      {
        title: "CX-1003 · Practitioner",
        body:
          "Emergency Patch: Change Management Bypass. An engineer pushes a CVSS 9.8 patch without CAB approval and takes production down. Tests A.5.26, A.8.32, A.10.1.",
      },
      {
        title: "CX-1004 · Practitioner",
        body:
          "Audit Prep: Sensitive Data on Unclassified Storage. Three days before surveillance audit, sensitive data is found on an open shared drive. Tests A.5.9, A.5.12, A.5.13, A.5.28, A.10.1.",
      },
      {
        title: "CX-1005 · Expert",
        body:
          "Ransomware: Group-Wide Business Continuity Invocation. Ransomware hits your largest subsidiary. Three connected entities at risk. Board convenes in four hours. Tests A.5.26, A.5.28, A.5.29, A.5.30, A.8.13. Multi-jurisdiction notification decision.",
      },
    ],
  },
  {
    id: "difficulty",
    title: "4. Difficulty Guide",
    steps: [
      {
        title: "Foundation",
        body:
          "Single-entity scenarios. One primary framework. One agent role. Two decision stages. Reference answers are directly grounded in one or two controls. Suitable for practitioners new to the standard or returning after a gap.",
        tips: [
          "One primary framework control per stage.",
          "Two decision stages.",
          "Good starting point: CX-1001.",
        ],
      },
      {
        title: "Practitioner",
        body:
          "Multi-obligation scenarios. Two or more intersecting frameworks. Stakeholder pressure is higher. Reference answers require balancing competing obligations — the wrong answer often satisfies one obligation while failing another.",
        tips: [
          "Reference answers balance two or more obligations.",
          "Wrong answers often satisfy one obligation while failing another.",
          "Three scenarios available: CX-1002, CX-1003, CX-1004.",
        ],
      },
      {
        title: "Expert",
        body:
          "Multi-entity, multi-jurisdiction scenarios. Board-level communication decisions. Regulatory notification across multiple authorities. Reference answers require sequencing decisions correctly across parallel tracks (forensic, legal, operational, regulatory). Three or more decision stages.",
        tips: [
          "Three decision stages including board communication.",
          "Notification decisions span multiple jurisdictions.",
          "One scenario available: CX-1005.",
        ],
      },
    ],
  },
  {
    id: "support",
    title: "5. Support & Resources",
    steps: [
      {
        title: "Getting help",
        body:
          "Press H anywhere in the app for the quick reference panel. This page covers the platform in depth.",
      },
      {
        title: "Reporting issues",
        body:
          "Report product issues via GitHub Issues at github.com/astra-ssj/The-Cortex.",
        tips: [
          "Include the scenario ID and stage when reporting a content issue.",
          "Include your browser console output when reporting a technical issue.",
        ],
      },
    ],
  },
];

export const HELP_TOC = HELP_DOC_SECTIONS.map((s) => ({ id: s.id, title: s.title }));
