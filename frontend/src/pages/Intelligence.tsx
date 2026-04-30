import { useState } from "react";
import { AuditSimulator } from "../components/AuditSimulator";
import { TelemetryFusion } from "../components/TelemetryFusion";

type IntelligenceTab = "simulator" | "signals";

export default function Intelligence() {
  const [tab, setTab] = useState<IntelligenceTab>("simulator");

  return (
    <div
      style={{
        minHeight: "calc(100vh - 120px)",
        fontFamily: '"DM Sans", sans-serif',
        color: "#e2e8f4",
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
          borderBottom: "1px solid #141e30",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: '"Syne", sans-serif',
              fontWeight: 700,
              fontSize: 24,
              margin: 0,
              letterSpacing: "-0.02em",
              color: "#f1f5f9",
            }}
          >
            Intelligence
          </h1>
          <p
            style={{
              fontFamily: '"Space Mono", monospace',
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 999,
              background: "#0f172a",
              border: "1px solid #164e63",
              fontSize: 12,
              color: "#2dd4bf",
            }}
          >
            <span
              className="intelligence-live-dot"
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#2dd4bf",
                flexShrink: 0,
              }}
            />
            4 Live Signals
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 999,
              background: "#0f172a",
              border: "1px solid #78350f",
              fontSize: 12,
              color: "#fbbf24",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#fbbf24",
                flexShrink: 0,
              }}
            />
            3 Regulators Modelled
          </span>
        </div>
      </header>

      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 28,
          marginBottom: 24,
          borderBottom: "1px solid #141e30",
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "simulator"}
          onClick={() => setTab("simulator")}
          style={{
            padding: "10px 0",
            marginBottom: -1,
            border: "none",
            borderBottom:
              tab === "simulator" ? "2px solid #2dd4bf" : "2px solid transparent",
            background: "transparent",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: tab === "simulator" ? 600 : 400,
            color: tab === "simulator" ? "#f8fafc" : "var(--dim)",
            fontFamily: "inherit",
          }}
        >
          Audit Simulator
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "signals"}
          onClick={() => setTab("signals")}
          style={{
            padding: "10px 0",
            marginBottom: -1,
            border: "none",
            borderBottom:
              tab === "signals" ? "2px solid #2dd4bf" : "2px solid transparent",
            background: "transparent",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: tab === "signals" ? 600 : 400,
            color: tab === "signals" ? "#f8fafc" : "var(--dim)",
            fontFamily: "inherit",
          }}
        >
          Live Signals
        </button>
      </div>

      {tab === "simulator" ? <AuditSimulator /> : <TelemetryFusion />}
    </div>
  );
}
