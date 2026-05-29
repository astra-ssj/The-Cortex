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
    title: "What is CORTEX?",
    intro:
      "CORTEX is an enterprise compliance intelligence platform built on ZTAIP (Zero Trust Agentic Intelligence Platform). It assesses your posture across regulations such as GDPR, NIS2, and the EU AI Act, routes uncertain AI decisions to human review, and links evidence to framework controls.",
    steps: [
      {
        title: "Who should use it",
        body:
          "Compliance officers, GRC teams, security leads, and executives who need a single view of regulatory posture, audit readiness, and remediation priorities across one or many legal entities.",
      },
      {
        title: "Core concepts",
        body:
          "Organisation → frameworks → controls → assessments → findings. Evidence comes from documents, integrations, and cloud scans. Every consequential AI action is confidence-scored; scores below 0.75 go to the Review Queue.",
        tips: [
          "Posture score: weighted compliance across active frameworks.",
          "Audit readiness: likelihood of passing an external audit today.",
          "ZTAIP: assessment engine behind live assessment streams.",
        ],
      },
    ],
  },
  {
    id: "account",
    title: "1. Account — Register & sign in",
    intro: "Start by creating your organisation account, then sign in. Returning users skip registration.",
    steps: [
      {
        title: "Register your organisation",
        body:
          "Open Register from the sign-in screen (or go to /register). Enter company name, jurisdiction, industry, your name, work email, and password (minimum 8 characters). Jurisdiction pre-selects relevant frameworks during onboarding.",
        snapshot: "register",
        snapshotCaption: "Registration collects org context used to tailor frameworks and assessments.",
        tips: [
          "Jurisdiction is stored locally and sent with your org profile.",
          "After successful registration you are signed in automatically.",
        ],
      },
      {
        title: "Sign in",
        body:
          "Use your work email and password on /login. On success, CORTEX stores your access token and user profile. If onboarding is incomplete, you are redirected to the setup wizard instead of the dashboard.",
        snapshot: "login",
        snapshotCaption: "Sign-in uses OAuth2-style token endpoint (email as username).",
        tips: [
          "Demo accounts may be available in development — check with your administrator.",
          "Session expiry clears the token and returns you to login.",
        ],
      },
    ],
  },
  {
    id: "onboarding",
    title: "2. Onboarding wizard",
    intro:
      "First-time users complete a three-step wizard before accessing the main application. You can skip the first assessment, but structure and frameworks should be saved.",
    steps: [
      {
        title: "Step 1 — Organisation structure",
        body:
          "Choose Single Entity (one company, one primary jurisdiction) or Multi-Entity Group (two or more entities with jurisdiction and role). Multi-entity groups need at least two named entities before continuing.",
        snapshot: "onboarding-structure",
        snapshotCaption: "Structure drives group dashboards and per-entity scope later.",
      },
      {
        title: "Step 2 — Frameworks",
        body:
          "Select regulations that apply to you. Frameworks are pre-selected from your jurisdiction (e.g. EU: GDPR, NIS2, EU AI Act, ISO 27001). Toggle cards on/off; you need at least one framework to continue.",
        snapshot: "onboarding-frameworks",
        snapshotCaption: "Framework list loads from GET /api/v1/frameworks.",
      },
      {
        title: "Step 3 — First assessment",
        body:
          "Review summary stats (framework count, control count, entities). Click Run First Assessment to start a live ZTAIP assessment stream, or Skip for now to enter the dashboard and run later.",
        snapshot: "onboarding-assess",
        snapshotCaption: "Running an assessment is recommended so posture scores are populated immediately.",
      },
      {
        title: "Assessment stream",
        body:
          "While the assessment runs, you see a live event log (SSE). When complete, onboarding is marked finished and you land on the Compliance Dashboard with refreshed posture data.",
        snapshot: "assessment-stream",
        snapshotCaption: "Events show per-control outcomes and confidence; low-confidence items appear in Review Queue.",
      },
    ],
  },
  {
    id: "navigation",
    title: "3. Navigation & layout",
    intro: "After onboarding, the app uses a persistent sidebar, top bar, and main content area.",
    steps: [
      {
        title: "Sidebar sections",
        body:
          "POSTURE: Dashboard, Frameworks, Graph, Findings, Group View. GOVERNANCE: Review Queue, Audit Report, AI Systems, Intelligence. OPERATIONS: Cloud Scans, Integrations, Roadmap. Footer: Settings and Help (this page).",
        snapshot: "sidebar",
        snapshotCaption: "Badge counts on Findings and Review Queue reflect open items.",
      },
      {
        title: "Command palette",
        body:
          "Press ⌘K (Mac) or Ctrl+K (Windows) to jump to any page, open a framework, or trigger Run assessment. Faster than clicking through the sidebar for power users.",
        snapshot: "command-palette",
      },
      {
        title: "Keyboard shortcuts",
        body:
          "D Dashboard · G Group · C Cloud scans · I Intelligence · A AI Systems · R Review queue · S Settings · H Help docs. Press Esc to close overlays.",
      },
    ],
  },
  {
    id: "workflow",
    title: "4. Recommended daily workflow",
    intro: "Follow this order to get value from CORTEX after initial setup.",
    steps: [
      {
        title: "Morning check — Dashboard",
        body:
          "Review overall posture score, audit readiness, and critical gaps. Scan framework cards for declining trends (↑ / ↓).",
        snapshot: "dashboard",
      },
      {
        title: "Connect evidence — Integrations",
        body:
          "Configure Microsoft 365, GitHub, AWS, or Azure under Integrations so live signals and documents feed assessments. Without connectors, demo/mock telemetry may be shown.",
        snapshot: "integrations",
      },
      {
        title: "Run or refresh assessment",
        body:
          "From Dashboard or the command palette, run an assessment when policies change or new evidence arrives. Watch the stream log; posture and review queue refresh on completion.",
      },
      {
        title: "Triage findings",
        body:
          "Open Findings (/findings) for NON_COMPLIANT controls. Open a finding for remediation detail, linked controls, and evidence. Prioritise HIGH and CRITICAL risk.",
        snapshot: "findings",
      },
      {
        title: "Human review",
        body:
          "Process Review Queue items where AI confidence is below 0.75. Approve to confirm the assessment, or Override with a mandatory note — both are logged to the evidence chain.",
        snapshot: "review-queue",
      },
      {
        title: "Cloud posture — Cloud Scans",
        body:
          "Start AWS/Azure scans when connectors are configured. Expand runs for findings mapped to framework controls (CIS, SOC 2, etc.).",
        snapshot: "cloud-scans",
      },
      {
        title: "Executive output — Audit Report",
        body:
          "Generate audit-ready summaries and PDF exports for leadership or external auditors from Audit Report.",
      },
    ],
  },
  {
    id: "pages",
    title: "5. Page-by-page reference",
    intro: "What each main screen is for and when to use it.",
    steps: [
      {
        title: "Dashboard (/dashboard)",
        body:
          "Compliance overview: posture score, audit readiness, critical gaps, framework table, and live assessment stream. Primary home screen after login.",
        snapshot: "dashboard",
      },
      {
        title: "Frameworks (/frameworks)",
        body:
          "Browse all registered frameworks and drill into control-level detail. Click a framework for requirements, evidence, and per-control status.",
        snapshot: "frameworks",
      },
      {
        title: "Graph (/graph)",
        body:
          "Visual map of relationships between frameworks, controls, entities, and evidence. Use for cross-regulation impact analysis.",
      },
      {
        title: "Findings (/findings)",
        body:
          "Remediation tracker for gaps surfaced by assessments and scans. Filter by risk, framework, and status.",
        snapshot: "findings",
      },
      {
        title: "Group View (/group)",
        body:
          "Multi-entity rollup when you configured a group at onboarding. Compare posture across subsidiaries or jurisdictions.",
      },
      {
        title: "Review Queue (/review-queue)",
        body:
          "Human-in-the-loop for low-confidence ZTAIP decisions (GDPR Art.22 / EU AI Act Art.14 alignment). Required before treating uncertain assessments as final.",
        snapshot: "review-queue",
      },
      {
        title: "Audit Report (/audit-report)",
        body:
          "Executive summaries and exportable reports for audit preparation.",
      },
      {
        title: "Intelligence (/intelligence)",
        body:
          "Audit Simulator, live integration signals, regulation intel feed, and Evidence Vault chain verification.",
      },
      {
        title: "AI Systems (/ai-systems)",
        body:
          "EU AI Act inventory: classify systems against Annex III, track high-risk obligations before August 2026 deadlines.",
      },
      {
        title: "Cloud Scans (/cloud-scans)",
        body:
          "Shasta CSPM runs for AWS/Azure; findings stored in CORTEX with framework control tags.",
        snapshot: "cloud-scans",
      },
      {
        title: "Integrations (/integrations)",
        body:
          "Step-by-step connector setup for cloud and SaaS evidence sources.",
        snapshot: "integrations",
      },
      {
        title: "Settings (/settings)",
        body:
          "Organisation, users, and API keys (tabs rolling out in future releases). Role-based access is enforced server-side.",
      },
    ],
  },
  {
    id: "roles",
    title: "6. Roles & permissions",
    steps: [
      {
        title: "Role-aware UI",
        body:
          "Your role (e.g. Admin, Compliance Lead, Viewer) controls actions such as running assessments, approving review items, and exporting reports. If a button is missing, your role may not allow that action.",
        tips: [
          "Admins: full configuration and assessment runs.",
          "Compliance Lead: assessments, review, integrations.",
          "Viewer: read-only posture and reports.",
        ],
      },
    ],
  },
  {
    id: "support",
    title: "7. Support & resources",
    steps: [
      {
        title: "Quick help panel",
        body:
          "Press H anywhere in the app for a searchable quick-reference panel (glossary, shortcuts). This full Help page covers onboarding and workflows in depth.",
      },
      {
        title: "Developer resources",
        body:
          "API contract, Docker Compose profiles, and LLM provider configuration are documented in the repository docs/ folder. Report product issues via your organisation's support channel or GitHub Issues.",
        tips: [
          "Repository: github.com/AstraLabs-AI/The-Cortex",
          "Smoke scripts: scripts/smoke_assessment_llm.sh, scripts/smoke_ingest_llm.sh",
        ],
      },
    ],
  },
];

export const HELP_TOC = HELP_DOC_SECTIONS.map((s) => ({ id: s.id, title: s.title }));
