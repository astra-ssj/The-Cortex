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
            4 Live Signals
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
            3 Regulators Modelled
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
            6 Regulatory Events
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 999,
              background: "var(--surface)",
              border: "1px solid color-mix(in srgb, var(--green) 45%, var(--border))",
              fontSize: 12,
              color: "var(--green)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--green)",
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
          border: "1px solid var(--border)",
          background: "var(--card)",
          fontSize: 12,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: "var(--amber)", fontWeight: 700 }}>Illustrative</span> — Audit Simulator, Signals,
        Regulation Intel, and Evidence Vault use <strong style={{ color: "var(--text)" }}>simulated / demo UX</strong> for
        storytelling; they are not a substitute for production evidence stores unless wired to backend APIs.
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
        <button
          type="button"
          role="tab"
          aria-selected={tab === "simulator"}
          onClick={() => setTab("simulator")}
          style={{
            padding: "10px 0",
            marginBottom: -1,
            border: "none",
            borderBottom: tab === "simulator" ? "2px solid var(--cyan)" : "2px solid transparent",
            background: "transparent",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: tab === "simulator" ? 600 : 400,
            color: tab === "simulator" ? "var(--text)" : "var(--dim)",
            fontFamily: "inherit",
          }}
        >
          Audit Simulator{" "}
          <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600 }}>(demo)</span>
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
            borderBottom: tab === "signals" ? "2px solid var(--cyan)" : "2px solid transparent",
            background: "transparent",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: tab === "signals" ? 600 : 400,
            color: tab === "signals" ? "var(--text)" : "var(--dim)",
            fontFamily: "inherit",
          }}
        >
          Live Signals{" "}
          <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600 }}>(demo)</span>
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
            borderBottom: tab === "regulation" ? "2px solid var(--cyan)" : "2px solid transparent",
            background: "transparent",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: tab === "regulation" ? 600 : 400,
            color: tab === "regulation" ? "var(--text)" : "var(--dim)",
            fontFamily: "inherit",
          }}
        >
          Regulation Intel{" "}
          <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600 }}>(demo)</span>
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
            borderBottom: tab === "vault" ? "2px solid var(--cyan)" : "2px solid transparent",
            background: "transparent",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: tab === "vault" ? 600 : 400,
            color: tab === "vault" ? "var(--text)" : "var(--dim)",
            fontFamily: "inherit",
          }}
        >
          Evidence Vault{" "}
          <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600 }}>(demo)</span>
        </button>
      </div>

      {tab === "simulator" && <AuditSimulator />}
      {tab === "signals" && <TelemetryFusion />}
      {tab === "regulation" && <RegulationIntel />}
      {tab === "vault" && <EvidenceVault />}
    </div>
  );
}
