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
    term: "NIS2",
    definition:
      "Network and Information Security Directive 2022/2555. EU cybersecurity law mandatory for essential and important entities. In force: October 2024.",
  },
  {
    term: "GDPR",
    definition:
      "General Data Protection Regulation 2016/679. EU data protection law. Max fine: €20M or 4% global turnover.",
  },
  {
    term: "EU AI Act",
    definition:
      "Regulation (EU) 2024/1689. World's first comprehensive AI law. High-risk obligations apply from 2 August 2026. Max fine: €35M or 7% global turnover.",
  },
  {
    term: "NIS2 Essential Entity",
    definition:
      "Large organisations in critical sectors (energy, transport, health, digital infra). Stricter obligations than Important Entities.",
  },
  {
    term: "ZTAIP",
    definition:
      "Zero Trust AI Intelligence Protocol. CORTEX's AI assessment engine. Every decision confidence-scored. Items below 0.75 confidence routed to human review.",
  },
  {
    term: "Annex III",
    definition:
      "EU AI Act list of high-risk AI system categories including biometrics, critical infrastructure, employment, education, law enforcement, and more.",
  },
  {
    term: "NIS2 Art.23",
    definition:
      "Incident reporting obligation. Early warning: 24 hours. Full notification: 72 hours. Final report: 1 month.",
  },
  {
    term: "GDPR Art.33",
    definition:
      "Breach notification to supervisory authority within 72 hours of becoming aware. Applies when breach risks individuals' rights.",
  },
];

const SECTIONS: HelpSection[] = [
  {
    id: "start",
    title: "Getting Started",
    blocks: [
      {
        subtitle: "Getting Started with CORTEX",
        body: "",
      },
      {
        subtitle: "1. Register your organisation",
        body:
          "Go to /register, enter your company details, choose your jurisdiction. CORTEX will pre-select relevant frameworks based on your location. See Help → full onboarding guide.",
      },
      {
        subtitle: "2. Complete the setup wizard",
        body: "Three steps: org structure → frameworks → first assessment. Takes under 3 min.",
      },
      {
        subtitle: "3. Understand your posture score",
        body:
          "Your score is a weighted average across all active frameworks. 0% = not assessed, 100% = fully compliant. Target: >70%.",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    blocks: [
      {
        subtitle: "Reading Your Compliance Dashboard",
        body: "",
      },
      {
        subtitle: "Overall Posture Score",
        body:
          "Weighted compliance score across all active frameworks. Updates after each assessment run.",
      },
      {
        subtitle: "Audit Readiness",
        body:
          "Probability of passing an external audit today. Considers evidence quality and recency, not just control status.",
      },
      {
        subtitle: "Critical Gaps",
        body:
          "Controls assessed as NON_COMPLIANT with HIGH or CRITICAL risk. These require immediate remediation action.",
      },
      {
        subtitle: "Framework Cards",
        body:
          "Each card shows score, status (PARTIAL / NON_COMPLIANT / COMPLIANT), risk level, and trend (↑ improving, ↓ declining).",
      },
    ],
  },
  {
    id: "intelligence",
    title: "Intelligence",
    blocks: [
      {
        subtitle: "Using the Intelligence Section",
        body: "",
      },
      {
        subtitle: "Audit Simulator",
        body:
          "Simulates a real regulatory audit based on published enforcement decisions. Select your regulator, framework, and entity to see likely questions and your weak points.",
      },
      {
        subtitle: "Evidence Vault",
        body:
          "Every assessment and approval is SHA-256 hashed and chain-linked. Use 'Verify Entire Chain' to confirm integrity. Suitable for NIS2 Art.20 liability defence.",
      },
    ],
  },
  {
    id: "review",
    title: "Review Queue",
    blocks: [
      {
        subtitle: "Human Review Queue — GDPR Art.22 / EU AI Act Art.14",
        body:
          "Items appear here when ZTAIP confidence is below 0.75 — meaning the AI is genuinely uncertain and requires human judgement.",
      },
      {
        subtitle: "Approve",
        body: "Confirms the AI assessment is correct. Logged to Evidence Vault.",
      },
      {
        subtitle: "Override",
        body:
          "Disagrees with AI assessment. Requires a review note. Both action and note logged to Evidence Vault for audit trail.",
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
          "D → Dashboard",
          "G → Group",
          "I → Intelligence",
          "R → Review Queue",
          "H → Help & Documentation (full page)",
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
        subtitle: "CORTEX v0.7.0 · AstraLabs Group",
        body:
          "Built with FastAPI, PostgreSQL, GraphJin, React, DSPy (Epic 4). Links below open in a new tab.",
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
