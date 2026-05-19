import { useState } from "react";
import AuditSimulator from "../components/AuditSimulator";
import TelemetryFusion from "../components/TelemetryFusion";
import RegulationIntel from "../components/RegulationIntel";
import EvidenceVault from "../components/EvidenceVault";
import { isFeatureEnabled } from "../lib/featureFlags";

type IntelTab = "simulator" | "signals" | "regulation" | "vault";

const TAB_DEFS: { key: IntelTab; label: string; demo: string }[] = [
  { key: "simulator", label: "Audit Simulator", demo: "(demo)" },
  { key: "signals", label: "Live Signals", demo: "(demo)" },
  { key: "regulation", label: "Regulation Intel", demo: "(demo)" },
  { key: "vault", label: "Evidence Vault", demo: "(demo)" },
];

export default function Intelligence() {
  const [tab, setTab] = useState<IntelTab>("simulator");

  const suiteGated =
    !isFeatureEnabled("auditSimulator") &&
    !isFeatureEnabled("telemetryFusion") &&
    !isFeatureEnabled("regulationIntel") &&
    !isFeatureEnabled("evidenceVault");

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
        {!suiteGated ? (
          /* TODO(intelligence): Replace labels below with live aggregates from telemetry / regulator / regulation / vault APIs when those services ship. */
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
              Evidence records
            </span>
          </div>
        ) : null}
      </header>

      {!suiteGated ? (
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
          Regulation Intel, and Evidence Vault use <strong style={{ color: "var(--text)" }}>simulated / demo UX</strong>{" "}
          for storytelling; they are not a substitute for production evidence stores unless wired to backend APIs.
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
        {TAB_DEFS.map(({ key, label, demo }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
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
            <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600 }}>{demo}</span>
          </button>
        ))}
      </div>

      <>
        {tab === "simulator" && <AuditSimulator />}
        {tab === "signals" && <TelemetryFusion />}
        {tab === "regulation" && <RegulationIntel />}
        {tab === "vault" && <EvidenceVault />}
      </>
    </div>
  );
}
