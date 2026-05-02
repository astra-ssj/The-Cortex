import { useState } from "react";
import { AuditSimulator } from "../components/AuditSimulator";
import { TelemetryFusion } from "../components/TelemetryFusion";
import { RegulationIntel } from "../components/RegulationIntel";
import { EvidenceVault } from "../components/EvidenceVault";

type IntelTab = "simulator" | "signals" | "regulation" | "vault";

export default function Intelligence() {
  const [tab, setTab] = useState<IntelTab>("simulator");

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
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 999,
              background: "#0f172a",
              border: "1px solid #1e40af",
              fontSize: 12,
              color: "#60a5fa",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#3b82f6",
                flexShrink: 0,
              }}
            />
            6 Regulatory Events
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 999,
              background: "#0f172a",
              border: "1px solid #14532d",
              fontSize: 12,
              color: "#4ade80",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#22c55e",
                flexShrink: 0,
              }}
            />
            12 Evidence Records
          </span>
        </div>
      </header>

      <div
        style={{
          marginBottom: 20,
          padding: "12px 14px",
          borderRadius: 8,
          border: "1px solid #1e2e48",
          background: "#0c1220",
          fontSize: 12,
          color: "#94a3b8",
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: "#fbbf24", fontWeight: 700 }}>Illustrative</span> — Audit Simulator, Signals,
        Regulation Intel, and Evidence Vault use <strong style={{ color: "#e2e8f4" }}>simulated / demo UX</strong>{" "}
        for storytelling; they are not a substitute for production evidence stores unless wired to backend APIs.
      </div>

      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 28,
          marginBottom: 24,
          borderBottom: "1px solid #141e30",
          flexWrap: "wrap",
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
          Audit Simulator{" "}
          <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600 }}>(demo)</span>
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
          Live Signals{" "}
          <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600 }}>(demo)</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "regulation"}
          onClick={() => setTab("regulation")}
          style={{
            padding: "10px 0",
            marginBottom: -1,
            border: "none",
            borderBottom:
              tab === "regulation" ? "2px solid #2dd4bf" : "2px solid transparent",
            background: "transparent",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: tab === "regulation" ? 600 : 400,
            color: tab === "regulation" ? "#f8fafc" : "var(--dim)",
            fontFamily: "inherit",
          }}
        >
          Regulation Intel{" "}
          <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600 }}>(demo)</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "vault"}
          onClick={() => setTab("vault")}
          style={{
            padding: "10px 0",
            marginBottom: -1,
            border: "none",
            borderBottom: tab === "vault" ? "2px solid #2dd4bf" : "2px solid transparent",
            background: "transparent",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: tab === "vault" ? 600 : 400,
            color: tab === "vault" ? "#f8fafc" : "var(--dim)",
            fontFamily: "inherit",
          }}
        >
          Evidence Vault{" "}
          <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600 }}>(demo)</span>
        </button>
      </div>

      {tab === "simulator" && <AuditSimulator />}
      {tab === "signals" && <TelemetryFusion />}
      {tab === "regulation" && <RegulationIntel />}
      {tab === "vault" && <EvidenceVault />}
    </div>
  );
}
