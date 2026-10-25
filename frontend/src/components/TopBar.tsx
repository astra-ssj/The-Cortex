import { useLocation } from "react-router-dom";

const ROUTE_TITLES: Record<string, string> = {
  "/practices": "Practices",
  "/learning": "Learning",
  "/progress": "Progress",
  "/team": "Team",
  "/settings": "Settings",
  "/scenarios/new": "Scenario studio",
  "/help": "Help",
};

export function TopBar() {
  const { pathname } = useLocation();
  const title = ROUTE_TITLES[pathname] ?? "Astra";

  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 24,
        padding: "24px 0 20px",
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap",
      }}
      aria-label="Page header"
    >
      <div style={{ minWidth: 0, flex: "1 1 240px" }}>
        <p
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          {title}
        </p>
        <p
          className="cortex-text-caption"
          style={{
            margin: "6px 0 0",
            color: "var(--text-tertiary)",
            maxWidth: 720,
          }}
        >
          Build and demonstrate GRC decision-making competency.
        </p>
      </div>
    </header>
  );
}
