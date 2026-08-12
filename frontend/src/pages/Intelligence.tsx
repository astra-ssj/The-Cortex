import { useNavigate, useParams } from "react-router-dom";
import AuditSimulator from "../components/AuditSimulator";

// Audit Simulator is the only remaining surface and is illustrative. The tab bar is
// kept so the sidebar deep-link and sub-route shape survive future additions.
type IntelTab = "simulator";

const TAB_DEFS: { key: IntelTab; label: string; path: string; demo: boolean }[] = [
  { key: "simulator", label: "Audit Simulator", path: "/intelligence/simulator", demo: true },
];

const TAB_BY_SLUG: Record<string, IntelTab> = {
  simulator: "simulator",
};

export default function Intelligence() {
  const navigate = useNavigate();
  const { tab: tabSlug } = useParams<{ tab?: string }>();
  const tab: IntelTab = tabSlug ? (TAB_BY_SLUG[tabSlug] ?? "simulator") : "simulator";

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
            Regulator-style audit rehearsal against your framework controls
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
        </div>
      </header>

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
        <span style={{ color: "var(--amber)", fontWeight: 700 }}>Illustrative</span> — Audit Simulator uses{" "}
        <strong style={{ color: "var(--text)" }}>simulated / demo UX</strong> for storytelling.
      </div>

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

      <>{tab === "simulator" && <AuditSimulator />}</>
    </div>
  );
}
