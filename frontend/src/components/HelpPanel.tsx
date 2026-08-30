import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LogoIcon } from "./Logo";
import { replayTour } from "../lib/welcomeTour";

type HelpSection = {
  id: string;
  title: string;
  blocks: { subtitle?: string; body: string }[];
};

export const GLOSSARY: { term: string; definition: string }[] = [
  {
    term: "Scenario",
    definition:
      "A case-based learning exercise presenting a realistic GRC decision under time or stakeholder pressure. Each scenario has 2-3 decision stages and a graded reference answer per stage.",
  },
  {
    term: "Competency Dimension",
    definition:
      "One of four independently scored aspects of GRC judgment: Control Mapping, Evidence Quality, Escalation Judgment, and Remediation. Each scores 0-100 and updates after every decision.",
  },
  {
    term: "Control Mapping",
    definition:
      "The ability to identify which framework control applies to a given situation and why. Scored on whether your decision aligns with the reference control and its rationale.",
  },
  {
    term: "Evidence Quality",
    definition:
      "The ability to make decisions that are supportable by documented evidence. Penalised for repeated wrong answers that suggest evidence blindness.",
  },
  {
    term: "Escalation Judgment",
    definition:
      "The ability to seek more information before committing to a decision under uncertainty. Rewarded for challenging and demanding justification where appropriate.",
  },
  {
    term: "Remediation",
    definition:
      "The ability to identify and scope corrective action at the remediation stage of a scenario. Only scored at escalation and later stages.",
  },
  {
    term: "Foundation",
    definition:
      "Entry difficulty. Single-entity scenarios with one primary framework. Suitable for practitioners new to GRC or a specific standard.",
  },
  {
    term: "Practitioner",
    definition:
      "Intermediate difficulty. Multi-obligation scenarios with intersecting frameworks and stakeholder pressure. For practitioners with 1-3 years GRC experience.",
  },
  {
    term: "Expert",
    definition:
      "Advanced difficulty. Multi-entity, multi-jurisdiction scenarios with board-level communication and regulatory notification decisions. For senior GRC and security leads.",
  },
  {
    term: "ISO 27001:2022",
    definition:
      "International standard for information security management systems. Requirements referenced in scenarios include A.5.9 (asset inventory), A.5.12 (classification), A.5.26 (incident response), A.5.29 (BCP), A.8.32 (change management), Clause 10.1 (nonconformity).",
  },
  {
    term: "GDPR Art.33",
    definition:
      "Breach notification to supervisory authority within 72 hours of becoming aware. Applies when a breach risks individuals' rights and freedoms. Appears in CX-1002 and CX-1005.",
  },
  {
    term: "NIS2 Art.19",
    definition:
      "Incident reporting for essential and important entities. Early warning within 24 hours, full notification within 72 hours. Appears in CX-1005.",
  },
];

const SECTIONS: HelpSection[] = [
  {
    id: "start",
    title: "Getting Started",
    blocks: [
      {
        subtitle: "New to Astra GRC?",
        body: "",
      },
      {
        subtitle: "Create an account",
        body:
          "Go to /register. Enter your company details and work email. After registering you land on the Audit Simulator. The demo account is admin@astralabs.com / admin.",
      },
      {
        subtitle: "Sign in",
        body:
          "Go to /login. You land on the Audit Simulator at /audit-simulator. Pick a framework and an audit type — ISO 27001:2022 is the only selectable framework; GDPR and SOC 2 show as coming soon. Start simulation then opens the Learning Loop. An active session on /learning resumes automatically.",
      },
      {
        subtitle: "First time here?",
        body:
          "Start with CX-1001 (foundation). Read the brief, read the agent message, then choose. The competency panel appears after your first decision. H reopens this panel; the full guide is at /help.",
      },
    ],
  },
  {
    id: "scenarios",
    title: "Scenarios",
    blocks: [
      {
        subtitle: "ISO 27001:2022 Track — 5 scenarios, Foundation to Expert",
        body:
          "ISO 27001:2022 is live. GDPR and SOC 2 are in development and have no scenario content yet.",
      },
      {
        subtitle: "CX-1001 · Foundation",
        body:
          "Friday Cutover: Privileged Cloud Access Request. Tests A.8.2, A.5.18, A.5.15, and NIST CSF 2.0 PR.AA-4. Two stages. Start here.",
      },
      {
        subtitle: "CX-1002 · Practitioner",
        body:
          "Third-Party Breach: Supplier Security Incident. 340 records, 72h GDPR clock. Tests A.5.19, A.5.20, A.5.26, A.5.28, A.6.8.",
      },
      {
        subtitle: "CX-1003 · Practitioner",
        body:
          "Emergency Patch: Change Management Bypass. CVSS 9.8 patch, production down. Tests A.5.26, A.8.32, Clause 10.1.",
      },
      {
        subtitle: "CX-1004 · Practitioner",
        body:
          "Audit Prep: Sensitive Data on Unclassified Storage. 3 days to audit. Tests A.5.9, A.5.10, A.5.12, A.5.13, A.5.26, A.5.28, Clause 10.1.",
      },
      {
        subtitle: "CX-1005 · Expert",
        body:
          "Ransomware: Group-Wide Business Continuity Invocation. Six entities, board in 4 hours, multi-jurisdiction notification. Tests A.5.26–A.5.30, A.8.13. Three stages.",
      },
    ],
  },
  {
    id: "workspace",
    title: "Scenario Workspace",
    blocks: [
      {
        subtitle: "Reading the workspace",
        body: "",
      },
      {
        subtitle: "Brief",
        body: "Your role and the situation. Read it before anything else. It does not change.",
      },
      {
        subtitle: "Agent message",
        body:
          "The stakeholder pressing for a decision. AI-driven — responds differently based on what you chose. Their demands are pressure, not instructions.",
      },
      {
        subtitle: "Choice buttons",
        body:
          "One reference answer per stage. Some wrong answers are worse than others. Decisions are final.",
      },
      {
        subtitle: "Stage and risk badges",
        body:
          "Stage: where you are in the scenario. Risk: the label assigned to your current decision position. Both update after each decision.",
      },
    ],
  },
  {
    id: "competency",
    title: "Competency Panel",
    blocks: [
      {
        subtitle: "Four independent dimensions",
        body: "",
      },
      {
        subtitle: "Control Mapping",
        body:
          "Right control for the situation? Typically +15 correct, -10 wrong at the opening stage. Observation cites the specific Annex A control.",
      },
      {
        subtitle: "Evidence Quality",
        body:
          "Decision supportable by evidence? Correct: +10. A first wrong answer does not move it. A wrong answer after an earlier one: -5 — pattern matters.",
      },
      {
        subtitle: "Escalation Judgment",
        body:
          "Seek information before committing? On CX-1001: challenge +20, least privilege +10, deny 0, approve all -15.",
      },
      {
        subtitle: "Remediation",
        body:
          "Scope corrective action correctly? Does not move on the opening decision — only at later stages. Starts at 50.",
      },
      {
        subtitle: "Score guide",
        body:
          "All start at 50. Above 70: consistent correct judgment. Below 40: pattern worth reviewing. A dimension below the floor is raised as a control gap you can retake. Resets on new scenario.",
      },
      {
        subtitle: "Point values are per scenario",
        body:
          "The numbers above are the ISO 27001:2022 track defaults. Each scenario choice carries its own authored weights, so some decisions move a dimension further than others.",
      },
    ],
  },
  {
    id: "posture",
    title: "Compliance Posture",
    blocks: [
      {
        subtitle: "Compliance Overview · /dashboard",
        body:
          "Your organisation's competency per control, derived only from completed sessions. First item under Discover. It reports what the team has demonstrated, not what is implemented — it is not audit evidence on its own.",
      },
      {
        subtitle: "Summary strip",
        body:
          "Controls assessed against controls the scenario library can exercise. Average competency across assessed controls, 0-100. Open gaps below the floor of 60. Not yet assessed — coverable controls no completed session has reached.",
      },
      {
        subtitle: "How a control scores",
        body:
          "Each choice you make maps to the controls it engages and the dimensions it tests. Your score for a control is the mean of your latest scores on those dimensions; the organisation's score is the mean across learners. Retaking replaces your earlier contribution.",
      },
      {
        subtitle: "Closing a gap",
        body:
          "Rows group Gap, then Developing, then Strong. Gap and Developing rows carry a Practise button that opens the scenario exercising that control. The debrief's View compliance posture button brings you here after a run.",
      },
      {
        subtitle: "Not yet assessed",
        body:
          "Coverable controls no completed session has touched. These are unknowns, not passes. Controls the scenario library cannot exercise are never listed.",
      },
    ],
  },
  {
    id: "difficulty",
    title: "Difficulty Levels",
    blocks: [
      {
        subtitle: "Foundation (cyan)",
        body:
          "Single entity, one primary framework, two stages. One or two controls per stage. Start here.",
      },
      {
        subtitle: "Practitioner (amber)",
        body:
          "Multi-obligation, intersecting frameworks. Wrong answers often satisfy one obligation while failing another.",
      },
      {
        subtitle: "Expert (red)",
        body:
          "Multi-entity, multi-jurisdiction, three+ stages. Board communication and regulatory notification. Attempt last.",
      },
    ],
  },
  {
    id: "shortcuts",
    title: "Keyboard Shortcuts",
    blocks: [
      {
        body:
          "D → Audit Simulator\nH → This quick reference panel\nR → Review Queue\nS → Settings\nEsc → Close this panel\nCmd/Ctrl+K → Command palette",
      },
    ],
  },
  {
    id: "support",
    title: "Support",
    blocks: [
      {
        subtitle: "Astra GRC Community Edition · AstraLabs Group",
        body:
          "Competence you can evidence. Open source — Apache 2.0, at github.com/astra-ssj/The-Cortex. Report issues via GitHub Issues. Include scenario ID and stage for content issues; browser console output for technical issues.",
      },
    ],
  },
];

function sectionHaystack(s: HelpSection): string {
  const parts = [s.title];
  for (const b of s.blocks) {
    if (b.subtitle) parts.push(b.subtitle);
    parts.push(b.body);
  }
  return parts.join(" ").toLowerCase();
}

export interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
}

export function HelpPanel({ open, onClose }: HelpPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["start"]));
  const [query, setQuery] = useState("");

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => sectionHaystack(s).includes(q));
  }, [query]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close help overlay"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--overlay-scrim)",
          border: "none",
          cursor: "pointer",
          zIndex: 1000,
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-panel-title"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(480px, 100vw)",
          background: "var(--sidebar)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-panel-left)",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s ease",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "20px 20px 12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <LogoIcon size={20} glow={false} />
            <div>
              <h2
                id="help-panel-title"
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--text)",
                  fontFamily: "var(--font-sans)",
                  letterSpacing: "-0.02em",
                }}
              >
                Help & Documentation
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
                Astra GRC Community Edition — competence you can evidence.
              </p>
              <Link
                to="/help"
                onClick={onClose}
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  fontSize: 12,
                  color: "var(--cyan)",
                  textDecoration: "none",
                }}
              >
                Open full onboarding guide →
              </Link>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  replayTour();
                }}
                style={{
                  display: "block",
                  marginTop: 8,
                  padding: 0,
                  border: "none",
                  background: "none",
                  fontSize: 12,
                  color: "var(--cyan)",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Replay welcome tour
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            style={{
              background: "var(--elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              width: 36,
              height: 36,
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "12px 20px" }}>
          <input
            type="search"
            placeholder="Search help topics..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 12px 24px 20px",
          }}
        >
          {filteredSections.map((section) => (
            <div key={section.id} style={{ marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => toggle(section.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  textAlign: "left",
                  padding: "12px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: expanded.has(section.id) ? "var(--elevated)" : "var(--surface)",
                  color: "var(--text)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                <span>{section.title}</span>
                <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>
                  {expanded.has(section.id) ? "−" : "+"}
                </span>
              </button>
              {expanded.has(section.id) && (
                <div
                  style={{
                    padding: "12px 10px 8px",
                    borderLeft: "2px solid var(--cyan)",
                    marginLeft: 8,
                    marginTop: 6,
                  }}
                >
                  {section.id === "support" ? (
                    <>
                      {section.blocks.map((b, i) => (
                        <div key={i} style={{ marginBottom: 12 }}>
                          {b.subtitle && (
                            <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text-secondary)" }}>
                              {b.subtitle}
                            </h3>
                          )}
                          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                            {b.body}
                          </p>
                        </div>
                      ))}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <Link
                          to="/help"
                          onClick={onClose}
                          style={{ color: "var(--cyan)", fontSize: 13, textDecoration: "none" }}
                        >
                          Help & onboarding (full page) →
                        </Link>
                        <a
                          href="https://github.com/astra-ssj/The-Cortex"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--cyan)", fontSize: 13 }}
                        >
                          View on GitHub →
                        </a>
                        <a
                          href="https://github.com/astra-ssj/The-Cortex/issues/new"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--cyan)", fontSize: 13 }}
                        >
                          Report an issue or idea →
                        </a>
                      </div>
                    </>
                  ) : (
                    section.blocks.map((b, i) => (
                      <div key={i} style={{ marginBottom: 14 }}>
                        {b.subtitle && (
                          <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
                            {b.subtitle}
                          </h3>
                        )}
                        {b.body ? (
                          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55, whiteSpace: "pre-line" }}>
                            {b.body}
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
