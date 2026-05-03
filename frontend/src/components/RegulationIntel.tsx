import { useMemo, useState, useEffect } from "react";

type ImpactLevel = "HIGH" | "MEDIUM" | "LOW";
type FrameworkId = "NIS2" | "GDPR / EDPB" | "EU AI Act" | "ISO 27001";

type RegulatoryEvent = {
  id: string;
  title: string;
  date: string;
  dateIso: string;
  source: string;
  summary: string;
  controls: string[];
  entities: string[];
  action: string;
  framework: FrameworkId;
  impact: ImpactLevel;
  isNew: boolean;
};

const CONTROL_DESCRIPTIONS: Record<string, string> = {
  "NIS2-IR-01": "Incident reporting — early warning within 24 hours.",
  "NIS2-IR-02": "Incident reporting — detailed notification follow-up.",
  "NIS2-RM-04": "Risk management — supply chain & ICT third-party risk.",
  "EUAI-HO-01": "Human oversight measures for high-risk AI systems.",
  "EUAI-RM-02": "Risk management system for AI lifecycle.",
  "EUAI-TR-01": "Transparency & provision of information to deployers.",
  "GDPR-AD-01": "Automated decision-making including profiling (Art.22).",
  "GDPR-BN-02": "Breach notification and documentation.",
  "GDPR-IT-01": "International transfers & appropriate safeguards.",
  "ISO-A.5.23": "Information security for cloud services.",
  "ISO-A.8.24": "Use of cryptography / cloud security extensions.",
};

const MOCK_EVENTS: RegulatoryEvent[] = [
  {
    id: "e1",
    title:
      "NIS2 Art.23 — BSI Implementing Act: Cross-Border Impact Clarification",
    date: "15 Apr 2026",
    dateIso: "2026-04-15",
    source: "BSI · Germany",
    summary:
      "BSI clarifies that 24-hour early warning must include preliminary assessment of cross-border impact under NIS2 Art.23(4)(a)",
    controls: ["NIS2-IR-01", "NIS2-IR-02", "NIS2-RM-04"],
    entities: ["AstraLabs DE", "AstraLabs ES"],
    action:
      "Update incident notification procedure to include cross-border impact assessment within 24-hour window",
    framework: "NIS2",
    impact: "HIGH",
    isNew: true,
  },
  {
    id: "e2",
    title: "EU AI Act — GPAI Code of Practice Final Draft Published",
    date: "10 Apr 2026",
    dateIso: "2026-04-10",
    source: "EU AI Office · Brussels",
    summary:
      "EU AI Office publishes final GPAI Code of Practice. Organisations deploying GPAI models must register with EU AI Office by Aug 2026",
    controls: ["EUAI-HO-01", "EUAI-RM-02", "EUAI-TR-01"],
    entities: ["AstraLabs Group", "AstraLabs DE"],
    action:
      "Register GPAI model usage with EU AI Office portal. Update Annex IV technical documentation.",
    framework: "EU AI Act",
    impact: "HIGH",
    isNew: true,
  },
  {
    id: "e3",
    title: "EDPB Guidelines 2/2026 — AI Systems and GDPR Art.22 Automated Decisions",
    date: "02 Apr 2026",
    dateIso: "2026-04-02",
    source: "EDPB · Brussels",
    summary:
      "EDPB clarifies that AI-assisted compliance scoring constitutes automated decision-making under Art.22 when it produces legal or similarly significant effects",
    controls: ["GDPR-AD-01", "GDPR-BN-02"],
    entities: ["AstraLabs DE", "AstraLabs ES", "AstraLabs UK"],
    action:
      "Conduct DPIA for AI-assisted scoring. Ensure human review mechanism documented and operational.",
    framework: "GDPR / EDPB",
    impact: "HIGH",
    isNew: true,
  },
  {
    id: "e4",
    title: "ISO/IEC 27001:2022 — FDIS Amendment 1 Published: Cloud Security Annex",
    date: "22 Mar 2026",
    dateIso: "2026-03-22",
    source: "ISO/IEC JTC1/SC27",
    summary:
      "Amendment adds 4 new controls to Annex A addressing multi-cloud environments and shared responsibility models (A.5.23 extension)",
    controls: ["ISO-A.5.23", "ISO-A.8.24"],
    entities: ["AstraLabs Group"],
    action: "Review cloud security policy against new Annex A controls. Update SoA.",
    framework: "ISO 27001",
    impact: "MEDIUM",
    isNew: false,
  },
  {
    id: "e5",
    title: "NIS2 — Spanish INCIBE-CERT Publishes National Transposition Technical Guide",
    date: "15 Mar 2026",
    dateIso: "2026-03-15",
    source: "INCIBE-CERT · Spain",
    summary:
      "Spain's national cybersecurity agency publishes sector-specific guidance for essential entities under Real Decreto 43/2021 extension",
    controls: ["NIS2-IR-01", "NIS2-RM-04"],
    entities: ["AstraLabs ES"],
    action:
      "Register AstraLabs ES with INCIBE-CERT. Submit entity classification form to CCN-CERT.",
    framework: "NIS2",
    impact: "MEDIUM",
    isNew: false,
  },
  {
    id: "e6",
    title: "EU AI Act — High-Risk AI System List Extended: HR Screening Tools",
    date: "01 Mar 2026",
    dateIso: "2026-03-01",
    source: "EU AI Office · Brussels",
    summary:
      "EU AI Office confirms AI-assisted CV screening and candidate ranking tools are high-risk under Annex III(4)(a) regardless of final human decision involvement",
    controls: ["EUAI-HO-01", "EUAI-RM-02"],
    entities: ["AstraLabs Group"],
    action:
      "Audit all HR AI tools. Classify under Annex III. Prepare conformity assessment route.",
    framework: "EU AI Act",
    impact: "MEDIUM",
    isNew: false,
  },
  {
    id: "e7",
    title: "ENISA NIS2 Good Practice Guide v1.2 — Supply Chain Security Update",
    date: "14 Feb 2026",
    dateIso: "2026-02-14",
    source: "ENISA · Athens",
    summary:
      "ENISA updates supply chain security guidance with new ICT third-party risk assessment templates under NIS2 Art.21(2)(d)",
    controls: ["NIS2-RM-04"],
    entities: ["AstraLabs DE", "AstraLabs ES"],
    action:
      "Download updated ENISA templates. Apply to next supplier assessment cycle.",
    framework: "NIS2",
    impact: "LOW",
    isNew: false,
  },
  {
    id: "e8",
    title: "GDPR — BfDI Annual Report 2025: Enforcement Priorities for 2026",
    date: "31 Jan 2026",
    dateIso: "2026-01-31",
    source: "BfDI · Berlin",
    summary:
      "BfDI signals 2026 enforcement focus on AI-assisted data processing, international data transfers, and public-sector DPIAs",
    controls: ["GDPR-BN-02", "GDPR-IT-01"],
    entities: ["AstraLabs DE"],
    action:
      "Review international transfer SCCs. Prioritise DPIA backlog before Q3 2026.",
    framework: "GDPR / EDPB",
    impact: "LOW",
    isNew: false,
  },
];

const FRAMEWORK_OPTIONS: { id: FrameworkId; label: string }[] = [
  { id: "NIS2", label: "NIS2 Directive" },
  { id: "GDPR / EDPB", label: "GDPR / EDPB" },
  { id: "EU AI Act", label: "EU AI Act" },
  { id: "ISO 27001", label: "ISO 27001" },
];

type ImpactFilter = "all" | "high" | "entities";

function entityFlag(name: string): string {
  if (name.includes("DE")) return "🇩🇪";
  if (name.includes("ES")) return "🇪🇸";
  if (name.includes("UK")) return "🇬🇧";
  if (name.includes("US")) return "🇺🇸";
  if (name.includes("AU")) return "🇦🇺";
  if (name.includes("Group")) return "🏢";
  return "🏢";
}

function impactBorder(impact: ImpactLevel): string {
  if (impact === "HIGH") return "var(--red)";
  if (impact === "MEDIUM") return "var(--amber)";
  return "var(--blue)";
}

function isWithinSevenDays(dateIso: string): boolean {
  const then = new Date(dateIso).getTime();
  const now = Date.now();
  return now - then >= 0 && now - then < 7 * 24 * 60 * 60 * 1000;
}

export function RegulationIntel() {
  const [frameworks, setFrameworks] = useState<Record<FrameworkId, boolean>>({
    NIS2: true,
    "GDPR / EDPB": true,
    "EU AI Act": true,
    "ISO 27001": true,
  });
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>("all");
  const [toast, setToast] = useState<string | null>(null);
  const [controlsModal, setControlsModal] = useState<string[] | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const filteredEvents = useMemo(() => {
    return MOCK_EVENTS.filter((ev) => {
      if (!frameworks[ev.framework]) return false;
      if (impactFilter === "high" && ev.impact !== "HIGH") return false;
      if (impactFilter === "entities") {
        const mine = ev.entities.some((e) => e !== "AstraLabs Group");
        if (!mine) return false;
      }
      return true;
    });
  }, [frameworks, impactFilter]);

  const toggleFw = (id: FrameworkId) => {
    setFrameworks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      {/* Left 35% */}
      <aside
        style={{
          flex: "0 0 35%",
          maxWidth: 380,
          padding: 20,
          background: "var(--surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 700,
            fontSize: 18,
            margin: 0,
            color: "var(--text)",
          }}
        >
          Regulatory Intelligence
        </h2>
        <p
          style={{
            fontSize: 12,
            color: "var(--dim)",
            lineHeight: 1.5,
            marginTop: 8,
          }}
        >
          Live feed of EU regulatory changes mapped to your control obligations
        </p>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8, textTransform: "uppercase" }}>
            Framework
          </div>
          {FRAMEWORK_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                cursor: "pointer",
                fontSize: 13,
                color: "var(--text)",
              }}
            >
              <input
                type="checkbox"
                checked={frameworks[opt.id]}
                onChange={() => toggleFw(opt.id)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8, textTransform: "uppercase" }}>
            Impact
          </div>
          {(
            [
              ["all", "All events"],
              ["high", "High impact only"],
              ["entities", "Affects my entities only"],
            ] as const
          ).map(([val, label]) => (
            <label
              key={val}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                cursor: "pointer",
                fontSize: 13,
                color: "var(--text)",
              }}
            >
              <input
                type="radio"
                name="impact-filter"
                checked={impactFilter === val}
                onChange={() => setImpactFilter(val)}
              />
              {label}
            </label>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 24 }}>
          {[
            { n: "6", l: "Events this month" },
            { n: "3", l: "High impact" },
            { n: "14", l: "Controls affected" },
          ].map((s) => (
            <div
              key={s.l}
              style={{
                padding: 12,
                background: "var(--bg)",
                borderRadius: 8,
                border: "1px solid var(--border-subtle)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{s.n}</div>
              <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>{s.l}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 20,
            padding: 14,
            background: "color-mix(in srgb, var(--amber) 6%, transparent)",
            border: "1px solid color-mix(in srgb, var(--amber) 50%, transparent)",
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--amber)", fontWeight: 600 }}>NEXT EXPECTED</div>
          <div style={{ fontSize: 13, color: "var(--text)", marginTop: 6 }}>NIS2 transposition deadline</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Germany · BSI implementing act</div>
          <span
            style={{
              display: "inline-block",
              marginTop: 10,
              padding: "4px 10px",
              borderRadius: 999,
              background: "color-mix(in srgb, var(--amber) 15%, transparent)",
              color: "var(--amber)",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Expected: Q2 2026
          </span>
        </div>
      </aside>

      {/* Right 65% */}
      <section style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              fontSize: 18,
              margin: 0,
              color: "var(--text)",
            }}
          >
            Regulatory Change Events
          </h2>
          <span style={{ fontSize: 12, color: "var(--dim)" }}>Sort: newest first</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filteredEvents.map((ev) => {
            const showNew = ev.isNew || isWithinSevenDays(ev.dateIso);
            return (
              <article
                key={ev.id}
                style={{
                  padding: 18,
                  background: "var(--surface)",
                  border: "1px solid var(--border-subtle)",
                  borderLeft: `4px solid ${impactBorder(ev.impact)}`,
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {showNew && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: "color-mix(in srgb, var(--blue) 20%, transparent)",
                        color: "var(--cyan)",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      NEW
                    </span>
                  )}
                  {ev.impact === "HIGH" && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: "color-mix(in srgb, var(--red) 20%, transparent)",
                        color: "var(--red)",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      HIGH IMPACT
                    </span>
                  )}
                </div>
                <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                  {ev.title}
                </h3>
                <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 12 }}>
                  Published: {ev.date} · {ev.source}
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55, margin: "0 0 14px", fontStyle: "italic" }}>
                  &ldquo;{ev.summary}&rdquo;
                </p>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>AFFECTED CONTROLS ({ev.controls.length}):</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {ev.controls.map((c) => (
                    <span
                      key={c}
                      style={{
                        padding: "4px 8px",
                        background: "var(--border-subtle)",
                        borderRadius: 4,
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>AFFECTED ENTITIES ({ev.entities.length}):</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                  {ev.entities.map((e) => (
                    <span key={e} style={{ fontSize: 13, color: "var(--text)" }}>
                      {entityFlag(e)} {e}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>REQUIRED ACTION:</div>
                <p style={{ fontSize: 13, color: "var(--text)", margin: "0 0 16px", lineHeight: 1.5 }}>
                  &ldquo;{ev.action}&rdquo;
                </p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setControlsModal(ev.controls)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: "1px solid var(--cyan)",
                      background: "transparent",
                      color: "var(--cyan)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    View Controls →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setToast("Finding created from regulatory event — added to Remediation Tracker")
                    }
                    style={{
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: "1px solid var(--blue)",
                      background: "color-mix(in srgb, var(--blue) 15%, transparent)",
                      color: "var(--blue)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Create Finding →
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {controlsModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "color-mix(in srgb, var(--bg) 65%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 24,
          }}
          onClick={() => setControlsModal(null)}
          onKeyDown={(e) => e.key === "Escape" && setControlsModal(null)}
        >
          <div
            style={{
              maxWidth: 480,
              width: "100%",
              background: "var(--surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "var(--text)" }}>Affected controls</h3>
              <button
                type="button"
                onClick={() => setControlsModal(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: 18,
                }}
              >
                ×
              </button>
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {controlsModal.map((cid) => (
                <li
                  key={cid}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border-subtle)",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--cyan)" }}>{cid}</span>
                  <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                    {CONTROL_DESCRIPTIONS[cid] ?? "Mapped obligation in your entity control set."}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "10px 18px",
            background: "var(--surface)",
            border: "1px solid var(--cyan)",
            borderRadius: 8,
            color: "var(--text)",
            fontSize: 13,
            zIndex: 1500,
            boxShadow: "var(--shadow-drop-md)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
