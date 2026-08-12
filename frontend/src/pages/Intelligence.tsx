import { useNavigate, useParams } from "react-router-dom";
import AuditSimulator from "../components/AuditSimulator";
import RegulationIntel from "../components/RegulationIntel";
import InsightsFeed from "../components/InsightsFeed";

// Insights is the reasoning layer (real backend); the remaining tabs are illustrative
// demo surfaces. Tabs map 1:1 to sub-routes so the sidebar can deep-link to each.
type IntelTab = "insights" | "simulator" | "regulation";

const TAB_DEFS: { key: IntelTab; label: string; path: string; demo: boolean }[] = [
  { key: "insights", label: "Insights", path: "/intelligence", demo: false },
  { key: "simulator", label: "Audit Simulator", path: "/intelligence/simulator", demo: true },
  { key: "regulation", label: "Regulation Intel", path: "/intelligence/regulation", demo: true },
];

const TAB_BY_SLUG: Record<string, IntelTab> = {
  simulator: "simulator",
  regulation: "regulation",
};

export default function Intelligence() {
  const navigate = useNavigate();
  const { tab: tabSlug } = useParams<{ tab?: string }>();
  const tab: IntelTab = tabSlug ? (TAB_BY_SLUG[tabSlug] ?? "insights") : "insights";

  // The demo banner only applies to the three illustrative tabs, never to Insights.
  const onDemoTab = tab !== "insights";

  return (
    <div
      style={{
        minHeight: "calc(100vh - 120px)",
        fontFamily: "var(--font-sans)",
        color: "var(--text)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              fontSize: 24,
              margin: 0,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            Intelligence
          </h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--dim)",
              margin: "8px 0 0",
              maxWidth: 420,
              lineHeight: 1.5,
            }}
          >
            AI-powered regulatory intelligence and live control telemetry
          </p>
        </div>
        {onDemoTab ? (
          /* TODO(intelligence): Replace labels below with live aggregates from telemetry / regulator / regulation APIs when those services ship. */
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 999,
                background: "var(--surface)",
                border: "1px solid color-mix(in srgb, var(--cyan) 45%, var(--border))",
                fontSize: 12,
                color: "var(--cyan)",
              }}
            >
              <span
                className="intelligence-live-dot"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--cyan)",
                  flexShrink: 0,
                }}
              />
              Telemetry signals
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 999,
                background: "var(--surface)",
                border: "1px solid color-mix(in srgb, var(--amber) 50%, var(--border))",
                fontSize: 12,
                color: "var(--amber)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--amber)",
                  flexShrink: 0,
                }}
              />
              Regulator scenarios
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 999,
                background: "var(--surface)",
                border: "1px solid color-mix(in srgb, var(--blue) 45%, var(--border))",
                fontSize: 12,
                color: "var(--blue)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--blue)",
                  flexShrink: 0,
                }}
              />
              Regulatory horizon
            </span>
          </div>
        ) : null}
      </header>

      {onDemoTab ? (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--card)",
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: "var(--amber)", fontWeight: 700 }}>Illustrative</span> — Audit Simulator and
          Regulation Intel use <strong style={{ color: "var(--text)" }}>simulated / demo UX</strong>{" "}
          for storytelling. The <strong style={{ color: "var(--text)" }}>Insights</strong> tab is live — it reasons over your real compliance graph.
        </div>
      ) : null}

      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 28,
          marginBottom: 24,
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
        }}
      >
        {TAB_DEFS.map(({ key, label, path, demo }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => navigate(path)}
            style={{
              padding: "10px 0",
              marginBottom: -1,
              border: "none",
              borderBottom: tab === key ? "2px solid var(--cyan)" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === key ? 600 : 400,
              color: tab === key ? "var(--text)" : "var(--dim)",
              fontFamily: "inherit",
            }}
          >
            {label}{" "}
            {demo ? (
              <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600 }}>(demo)</span>
            ) : null}
          </button>
        ))}
      </div>

      <>
        {tab === "insights" && <InsightsFeed />}
        {tab === "simulator" && <AuditSimulator />}
        {tab === "regulation" && <RegulationIntel />}
      </>
    </div>
  );
}
