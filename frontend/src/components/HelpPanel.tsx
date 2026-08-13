import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LogoIcon } from "./Logo";

type HelpSection = {
  id: string;
  title: string;
  blocks: { subtitle?: string; body: string }[];
};

const GLOSSARY: { term: string; definition: string }[] = [
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
      "International standard for information security management systems. Annex A controls referenced in scenarios include A.5.9 (asset inventory), A.5.12 (classification), A.5.26 (incident response), A.5.29 (BCP), A.8.32 (change management), A.10.1 (nonconformity).",
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
        subtitle: "Welcome to the CORTEX Learning Platform",
        body: "",
      },
      {
        subtitle: "1. Choose a scenario",
        body:
          "The scenario selector shows all available cases organised by difficulty. Foundation scenarios are single-entity with one primary framework. Practitioner and expert scenarios involve multiple obligations, stakeholder pressure, and cross-entity decisions. Start with foundation if you are new to the standard.",
      },
      {
        subtitle: "2. Read the brief",
        body:
          "Each scenario opens with a situation brief and an agent turn from a stakeholder pressing for a decision. Read both before choosing. The agent's demands tell you what they expect — that is not always what the right answer is.",
      },
      {
        subtitle: "3. Make your decision",
        body:
          "Choose from the available options. There is one reference answer per stage, grounded in a specific framework control. Wrong answers are not penalised uniformly — some wrong answers reflect worse judgment than others.",
      },
      {
        subtitle: "4. Read the competency panel",
        body:
          "After your first decision, the competency panel appears below the agent thread. Four dimensions update independently. A ▲ means you moved in the right direction. A ▼ means the decision cost you on that dimension. The observation text explains why.",
      },
    ],
  },
  {
    id: "scenarios",
    title: "Scenarios",
    blocks: [
      {
        subtitle: "Current ISO 27001:2022 Track",
        body: "",
      },
      {
        subtitle: "CX-1001 · Foundation",
        body:
          "Friday Cutover: Privileged Cloud Access Request. A DevOps Lead needs broad cloud access before a production cutover. Tests A.8.2, A.5.18, A.5.15. Two decision stages: access_request, escalation.",
      },
      {
        subtitle: "CX-1002 · Practitioner",
        body:
          "Third-Party Breach: Supplier Security Incident. Your SaaS HR provider reports a breach affecting 340 employee records. Tests A.5.19, A.5.20, A.5.26, A.5.28. 72-hour GDPR clock running.",
      },
      {
        subtitle: "CX-1003 · Practitioner",
        body:
          "Emergency Patch: Change Management Bypass. An engineer pushes a CVSS 9.8 patch without CAB approval and takes production down. Tests A.5.26, A.8.32, A.10.1.",
      },
      {
        subtitle: "CX-1004 · Practitioner",
        body:
          "Audit Prep: Sensitive Data on Unclassified Storage. Three days before surveillance audit, sensitive data is found on an open shared drive. Tests A.5.9, A.5.12, A.5.13, A.5.28, A.10.1.",
      },
      {
        subtitle: "CX-1005 · Expert",
        body:
          "Ransomware: Group-Wide Business Continuity Invocation. Ransomware hits your largest subsidiary. Three connected entities at risk. Board convenes in four hours. Tests A.5.26, A.5.28, A.5.29, A.5.30, A.8.13. Multi-jurisdiction notification decision.",
      },
    ],
  },
  {
    id: "competency",
    title: "Competency Panel",
    blocks: [
      {
        subtitle: "How Scoring Works",
        body:
          "Scores start at 50 on your first decision and update after each stage. Each dimension scores independently — you can map controls correctly while showing poor escalation judgment. The panel shows your current score, the direction of your last move (▲ ▼ —), and one observation sentence explaining the move.",
      },
      {
        subtitle: "Control Mapping (0-100)",
        body:
          "Scored at every decision stage. +15 for a correct answer at access_request, +10 at escalation. Wrong answers cost proportionally. The observation cites the specific control your decision satisfied or violated.",
      },
      {
        subtitle: "Evidence Quality (0-100)",
        body:
          "Scored on whether your decision is supportable by documented evidence. Penalised additionally for repeated wrong answers — a second wrong answer on the same scenario suggests evidence blindness, not just a single misjudgment.",
      },
      {
        subtitle: "Escalation Judgment (0-100)",
        body:
          "Scored on your information-seeking behaviour. Challenging and demanding justification scores highest (+20). Controlled approval scores well (+10). Approving everything without scrutiny scores worst (-15). Denial is valid but avoidant (0).",
      },
      {
        subtitle: "Remediation (0-100)",
        body:
          "Only scored at the escalation stage and later. Starts at 50 and does not move at the access_request stage. Tests whether you can scope corrective action correctly once a situation has escalated.",
      },
    ],
  },
  {
    id: "difficulty",
    title: "Difficulty Levels",
    blocks: [
      {
        subtitle: "Foundation",
        body:
          "Single-entity scenarios. One primary framework. One agent role. Two decision stages. Reference answers are directly grounded in one or two controls. Suitable for practitioners new to the standard or returning after a gap.",
      },
      {
        subtitle: "Practitioner",
        body:
          "Multi-obligation scenarios. Two or more intersecting frameworks. Stakeholder pressure is higher. Reference answers require balancing competing obligations — the wrong answer often satisfies one obligation while failing another.",
      },
      {
        subtitle: "Expert",
        body:
          "Multi-entity, multi-jurisdiction scenarios. Board-level communication decisions. Regulatory notification across multiple authorities. Reference answers require sequencing decisions correctly across parallel tracks (forensic, legal, operational, regulatory). Three or more decision stages.",
      },
    ],
  },
  {
    id: "glossary",
    title: "Regulatory Glossary",
    blocks: [
      {
        subtitle: "Searchable glossary",
        body: "Use the search bar above to filter terms below.",
      },
      ...GLOSSARY.map((g) => ({
        subtitle: g.term,
        body: g.definition,
      })),
    ],
  },
  {
    id: "shortcuts",
    title: "Keyboard Shortcuts",
    blocks: [
      {
        body: [
          "L → Learning (scenario selector)",
          "H → Help & Documentation",
          "Esc → Close panel",
        ].join("\n"),
      },
    ],
  },
  {
    id: "support",
    title: "Support",
    blocks: [
      {
        subtitle: "CORTEX Learning Platform · AstraLabs Group",
        body: "Built with FastAPI, PostgreSQL, React. Report issues via GitHub Issues.",
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
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>CORTEX v0.7.0</p>
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
                          href="https://github.com/AstraLabs-AI/The-Cortex"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--cyan)", fontSize: 13 }}
                        >
                          View on GitHub →
                        </a>
                        <a
                          href="https://github.com/AstraLabs-AI/The-Cortex/issues/new"
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
