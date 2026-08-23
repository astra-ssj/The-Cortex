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
    title: "What is Astra GRC?",
    intro:
      "Astra GRC Community Edition is a case-based GRC competency training platform built by AstraLabs Group. It places you inside realistic security and compliance scenarios, grades your decisions against framework-grounded reference answers, and tracks your competency across four independent dimensions. The goal is judgment under pressure — not recall.",
    steps: [
      {
        title: "Who it is for",
        body:
          "Security leads, GRC practitioners, compliance officers, and risk managers who want to build and verify decision-making competency in realistic scenarios. Astra GRC is also used for team training, new-hire onboarding into GRC roles, and CPD evidence for security certifications.",
      },
      {
        title: "How it differs from a course or certification",
        body:
          "Courses test whether you can recall a framework. Astra GRC tests whether you make the right decision when a stakeholder is pressing you, the clock is running, and the correct answer is not obvious. Every scenario has a reference answer grounded in a specific framework control. You see the rationale after your decision — win or lose.",
        tips: [
          "Scenarios are graded against a reference answer, not multiple choice recall.",
          "Four competency dimensions update independently after each decision.",
          "Wrong answers cost different amounts — some reflect worse judgment than others.",
          "The AI agent responds differently depending on what you decided.",
        ],
      },
      {
        title: "What you will be able to do after the ISO 27001:2022 track",
        body:
          "After completing all five scenarios you will have made graded decisions on: access control under pressure (A.8.2, A.5.18), supplier incident response (A.5.19, A.5.20), change management failure (A.8.32, A.10.1), asset classification and audit disclosure (A.5.9, A.5.12, A.10.1), and group-wide business continuity invocation (A.5.29, A.5.30) with multi-jurisdiction notification. Your competency panel will show your scored performance across all four dimensions.",
      },
    ],
  },
  {
    id: "getting-started",
    title: "1. Getting Started",
    steps: [
      {
        title: "Create your account",
        body:
          "Go to /register. Enter your company name, jurisdiction, industry, full name, and work email. Choose a password of at least 8 characters. Click Create Account. You will land on the Audit Simulator.",
        tips: [
          "Jurisdiction is used to contextualise scenario briefings in future tracks — choose your primary operating jurisdiction.",
          "Your account is private. No scenario results are shared with other users.",
        ],
      },
      {
        title: "Sign in to an existing account",
        body:
          "Go to /login. Enter your work email and password. You will land on the Audit Simulator at /audit-simulator. From there you choose a framework and an audit type, then Run Assessment opens the Learning Loop. ISO 27001:2022 is currently the only selectable framework — GDPR and SOC 2 are in development and show as coming soon. If you already have an active scenario session, opening /learning resumes it.",
      },
      {
        title: "Demo account",
        body:
          "The platform ships with a demo account: admin@astralabs.com / admin. This account is pre-seeded with AstraLabs Group org data and is suitable for evaluating the platform before registering.",
        tips: [
          "Do not use the demo account for personal competency tracking — create your own account.",
          "Demo account sessions may be reset between versions.",
        ],
      },
    ],
  },
  {
    id: "platform",
    title: "2. Platform Overview",
    steps: [
      {
        title: "Navigation",
        body:
          "The sidebar is grouped as TRAIN (Audit Simulator, Learning Loop, My Progress, Team Ledger), Discover (Review Queue, Control Gaps, Remediation Tracker), Evidence, and Operations. Team Ledger and Settings are admin-only and are hidden from analyst and viewer accounts. Press H anywhere to open the quick reference panel. Press D to return to the Audit Simulator. Press Esc to close the quick reference panel. Replay the first-visit welcome tour from Help (this page or the H panel).",
      },
      {
        title: "The Audit Simulator",
        body:
          "The Audit Simulator is your home screen. Choose a framework and an audit type, then click Run Assessment. ISO 27001:2022 is the only selectable framework — GDPR and SOC 2 are in development and carry a Coming Soon badge. Audit type sets the framing of your briefing; it does not yet filter the scenario list. Run Assessment opens the Learning Loop, which lists every active scenario. You can also open /learning directly.",
        tips: [
          "Foundation scenarios are the right starting point if you are new to ISO 27001:2022.",
          "You can only run one scenario at a time. Starting a new scenario clears your current session.",
        ],
      },
      {
        title: "The scenario workspace",
        body:
          "Once you start a scenario the workspace opens. It shows: the stage and risk badge at the top, the scenario brief, the AI agent message thread, the competency panel (after your first decision), and the choice buttons at the bottom. Read the brief and the agent message before choosing.",
      },
      {
        title: "Difficulty badges",
        body:
          "Foundation (cyan) — single-entity, one primary framework, two decision stages. Practitioner (amber) — multi-obligation, intersecting frameworks, stakeholder pressure. Expert (red) — multi-entity, multi-jurisdiction, board-level decisions, three or more stages.",
      },
    ],
  },
  {
    id: "how-it-works",
    title: "3. How Scenarios Work",
    steps: [
      {
        title: "The scenario loop",
        body:
          "Each scenario runs through 2-3 decision stages. At each stage: read the agent message and their demands, then choose one of 3-4 options. After your choice the agent responds in character based on what you decided, the next stage opens, and your competency panel updates. The loop ends at the terminal stage.",
        tips: [
          "The agent is AI-driven — its response changes based on your decision.",
          "The agent's demands are stakeholder pressure, not instructions. They are often wrong.",
          "You cannot go back. Decisions are final per stage.",
          "The competency panel only appears after your first decision.",
        ],
      },
      {
        title: "The brief",
        body:
          "The brief at the top of the workspace sets the scene. Read it carefully — it tells you your role, the organisation context, what has happened, and what is at stake. The brief does not change during the scenario.",
      },
      {
        title: "The agent",
        body:
          "The agent represents a stakeholder in the scenario — a DevOps Lead demanding access, a supplier managing a breach, an engineer defending a process bypass. The agent responds to your decisions in real time. It is not neutral — it has its own interests and will press you. Your job is to make the right decision for the organisation, not to satisfy the agent.",
      },
      {
        title: "Making a decision",
        body:
          "The choice buttons appear at the bottom of the workspace. Each button is a possible response to the current stage. There is one reference answer per stage — the choice that best satisfies the applicable framework control. Other choices may partially satisfy the control or fail it entirely. Some wrong answers are worse than others.",
      },
      {
        title: "After your decision",
        body:
          "After choosing, the agent responds in character, the stage advances, new choices appear for the next stage, and the competency panel updates with your scores and an observation explaining what moved and why. The observation cites the specific control your decision satisfied or violated.",
      },
      {
        title: "The terminal stage",
        body:
          "The scenario ends when the terminal stage is reached. The agent gives a closing message acknowledging your decision position. Your final competency scores are shown in the panel. To start a new scenario, return to the selector using the navigation or the reset option.",
      },
    ],
  },
  {
    id: "competency",
    title: "4. Competency Panel",
    intro:
      "The competency panel tracks your GRC judgment across four independent dimensions. Each dimension reflects a distinct failure mode — a strong score on control mapping does not compensate for poor escalation judgment. The point values below are the ISO 27001:2022 track defaults; each scenario choice carries its own authored weights, so some decisions move a dimension further than others.",
    steps: [
      {
        title: "Reading the panel",
        body:
          "Each dimension card shows: the dimension name, your current score (0-100), a progress bar, a delta indicator (▲ improved, ▼ declined, — unchanged), and an observation sentence explaining what moved and why. The panel is hidden before your first decision and updates after each subsequent decision.",
      },
      {
        title: "Control Mapping",
        body:
          "Can you identify the right framework control for the situation and apply it correctly? Scored at every decision stage. The observation cites the specific Annex A control or framework clause your decision satisfied or violated. This is the primary dimension — it reflects whether you understand what the standard actually requires.",
        tips: [
          "Correct decisions score +15 at the opening stage, +10 at later stages.",
          "Wrong decisions cost -10 at the opening stage, -8 at later stages.",
        ],
      },
      {
        title: "Evidence Quality",
        body:
          "Are your decisions supportable by documented evidence? A single wrong answer costs you nothing here — it reflects a misjudgment, not evidence blindness. A wrong answer that follows an earlier wrong answer in the same scenario is penalised, because that pattern suggests you are not grounding decisions in evidence, which is a more serious failure than a one-off error.",
        tips: [
          "Correct answer: +10 on evidence.",
          "First wrong answer: no change — evidence holds.",
          "Each wrong answer after an earlier one: -5.",
        ],
      },
      {
        title: "Escalation Judgment",
        body:
          "Do you seek more information before committing under uncertainty? This dimension measures information-seeking behaviour, not just the final call. Challenging a request and demanding justification scores highest. Approving everything without scrutiny scores worst. A flat denial is valid but avoidant — it scores neutrally.",
        tips: [
          "Challenge / demand justification: +20.",
          "Least privilege / controlled approval: +10.",
          "Deny: 0 (avoidant but not harmful).",
          "Approve all without scrutiny: -15.",
        ],
      },
      {
        title: "Remediation",
        body:
          "Can you scope corrective action correctly once a situation has escalated? This dimension does not move on the opening decision — there is nothing to remediate before the facts are established. It scores from the second decision stage onwards. Expert scenarios test remediation more heavily. Starting at 50, it reflects your ability to define what needs to change after a control failure, not just whether you identified the failure.",
        tips: [
          "Not scored at the opening stage — stays at 50.",
          "Correct at a later stage: +15.",
          "Wrong at a later stage: -10.",
        ],
      },
      {
        title: "Score interpretation",
        body:
          "All scores start at 50 and clamp between 0 and 100. A score above 70 on a dimension indicates consistent correct judgment. A score below 40 indicates a pattern of poor judgment on that dimension worth reviewing. Any dimension left below the competency floor is raised as a control gap in the debrief, which you can close by retaking the scenario. Scores are per-session — they reset when you start a new scenario.",
      },
    ],
  },
  {
    id: "scenarios",
    title: "5. Scenario Library",
    intro:
      "Astra GRC Community Edition ships five ISO 27001:2022 scenarios across three difficulty levels, Foundation to Expert. ISO 27001:2022 is live; GDPR and SOC 2 are in development and have no scenario content in this release.",
    steps: [
      {
        title: "Recommended order",
        body:
          "Start with CX-1001 (foundation) to understand the scenario loop and competency panel before moving to practitioner difficulty. Complete the three practitioner scenarios in any order. Attempt CX-1005 (expert) last — it requires sequencing decisions across parallel tracks and spans three decision stages.",
      },
      {
        title: "CX-1001 · Foundation · Friday Cutover: Privileged Cloud Access Request",
        body:
          "You are the security reviewer for a Friday production cutover. The DevOps Lead needs broad cloud access — prod admin, staging, and shared CI. Two decision stages: access_request and escalation. Tests ISO 27001:2022 A.8.2 (privileged access rights), A.5.18 (access rights), A.5.15 (access control), and maps to NIST CSF 2.0 PR.AA-4. Reference answers: least_privilege at both stages. Good starting point for anyone new to access control scenarios.",
        tips: [
          "The DevOps Lead will push hard — that is the point.",
          "Challenge at the first stage to reach the escalation stage where the justification is tested.",
        ],
      },
      {
        title: "CX-1002 · Practitioner · Third-Party Breach: Supplier Security Incident",
        body:
          "Your SaaS HR platform provider has reported a breach affecting 340 employee records. You have 72 hours under GDPR Article 33. Two decision stages: initial_assessment and notification_decision. Tests A.5.19 (supplier relationships), A.5.20 (supplier agreements), A.5.26 (incident response), A.5.28 (evidence collection), A.6.8 (event reporting). Reference answers: invoke_supplier_contract, notify_authority_assess_subjects.",
        tips: [
          "The GDPR clock runs independently of forensic completion.",
          "Article 34 individual notification requires a risk assessment first — it is not automatic.",
        ],
      },
      {
        title: "CX-1003 · Practitioner · Emergency Patch: Change Management Bypass",
        body:
          "An engineer pushed a CVSS 9.8 patch without CAB approval and took production down. Two decision stages: initial_response and root_cause_decision. Tests A.5.26 (incident response), A.8.32 (change management), A.10.1 (nonconformity and corrective action). Reference answers: invoke_incident_process, raise_nonconformity.",
        tips: [
          "The patch being correct does not excuse bypassing change governance.",
          "Both the technical gap and the process gap require corrective action.",
        ],
      },
      {
        title: "CX-1004 · Practitioner · Audit Prep: Sensitive Data on Unclassified Storage",
        body:
          "Three days before your ISO 27001:2022 surveillance audit, sensitive data is found on an unclassified shared drive accessible to all 340 staff. Two decision stages: initial_assessment and audit_disclosure_decision. Tests A.5.9 (asset inventory), A.5.10 (acceptable use), A.5.12 (classification), A.5.13 (labelling), A.5.26 (incident response), A.5.28 (evidence), A.10.1 (nonconformity). Reference answers: restrict_and_log, disclose_and_self_raise.",
        tips: [
          "Deleting files destroys evidence — do not do it.",
          "Proactive disclosure to an auditor demonstrates ISMS maturity, not weakness.",
          "GDPR Article 33 applies independently of the ISO audit.",
        ],
      },
      {
        title: "CX-1005 · Expert · Ransomware: Group-Wide Business Continuity Invocation",
        body:
          "Ransomware hits your largest subsidiary at 06:15 on a Monday. You are Group CISO of six entities across six jurisdictions; three others share network segments with the affected subsidiary. The board convenes in four hours. Three decision stages: invocation_decision, containment_strategy, and board_communication. Tests A.5.26, A.5.28, A.5.29 (business continuity), A.5.30 (ICT readiness), A.8.13 (backup). Multi-jurisdiction notification decision. Reference answers: invoke_and_isolate, image_then_restore, board_brief_staged_notify.",
        tips: [
          "BCP invocation is triggered by disruption, not by forensic confirmation of scope.",
          "Forensics and containment run in parallel — not sequentially.",
          "Notification obligations are jurisdiction-specific — staged notification by confirmed scope.",
          "Paying the ransom destroys evidence and funds the next attack.",
        ],
      },
    ],
  },
  {
    id: "track",
    title: "6. The ISO 27001:2022 Track",
    steps: [
      {
        title: "What the track covers",
        body:
          "The ISO 27001:2022 track is a structured progression through five scenarios covering the control domains most frequently tested in surveillance audits and enforcement actions: access control, supplier management, incident response, asset management, and business continuity. Each scenario is independently completable — you do not need to complete them in order, but the recommended sequence builds complexity progressively.",
      },
      {
        title: "Controls exercised across the track",
        body:
          "By completing all five scenarios you will have made graded decisions on 17 distinct Annex A controls: A.5.9, A.5.10, A.5.12, A.5.13, A.5.15, A.5.18, A.5.19, A.5.20, A.5.26, A.5.28, A.5.29, A.5.30, A.6.8, A.8.2, A.8.13, A.8.32, A.10.1. These cover the control areas most often examined in surveillance audits.",
      },
      {
        title: "Using Astra GRC for CPD",
        body:
          "Scenario completions and competency scores provide evidence of structured GRC practice for CPD purposes. Screenshot your competency panel at the terminal stage of each scenario as a timestamped record. Astra GRC does not yet issue certificates — that is on the roadmap.",
      },
      {
        title: "What comes next",
        body:
          "GDPR and SOC 2 are in development. Both appear in the Audit Simulator with a Coming Soon badge and are not yet selectable, and neither has scenario content in this release. Further tracks are under consideration but not committed. Track releases follow scenario content availability.",
      },
    ],
  },
  {
    id: "support",
    title: "7. Support & Resources",
    steps: [
      {
        title: "In-app quick reference",
        body:
          "Press H anywhere in the app to open the quick reference panel. It contains the scenario descriptions, competency dimension explanations, difficulty guide, and keyboard shortcuts. This page is the fuller guide, and the panel links to it.",
      },
      {
        title: "Keyboard shortcuts",
        body:
          "D — Audit Simulator (home). H — open the quick reference panel, not this page. R — Review Queue. S — Settings. Esc — close the quick reference panel. Cmd/Ctrl+K — command palette. Shortcuts work from any authenticated page when you are not typing in a field; Cmd/Ctrl+K works even inside a field.",
      },
      {
        title: "Reporting a content issue",
        body:
          "If a scenario brief, agent message, choice label, or framework rationale contains an error, report it via GitHub Issues at github.com/astra-ssj/The-Cortex. Include the scenario ID (e.g. CX-1004), the stage slug, and the specific text you believe is incorrect.",
        tips: [
          "Include the scenario ID and stage slug.",
          "Quote the exact text you believe is wrong.",
          "Suggest the correction if you can.",
        ],
      },
      {
        title: "Reporting a technical issue",
        body:
          "For login failures, blank pages, or unexpected behaviour: include your browser name and version, the URL where the issue occurred, and any error text from the browser console (F12 → Console tab). Report via GitHub Issues.",
        tips: [
          "Open F12 → Console before reproducing the issue.",
          "Screenshot the console output alongside the page.",
        ],
      },
      {
        title: "Astra GRC Community Edition",
        body:
          "Astra GRC Community Edition is open source under the Apache License 2.0. The source is at github.com/astra-ssj/The-Cortex. Enterprise features, commercial licensing, and support are available separately from AstraLabs Group.",
      },
    ],
  },
];

export const HELP_TOC = HELP_DOC_SECTIONS.map((s) => ({ id: s.id, title: s.title }));
