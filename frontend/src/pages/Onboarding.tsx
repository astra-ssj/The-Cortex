import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { LogoFull } from "../components/Logo";
import {
  ALL_FRAMEWORK_IDS,
  assessmentsApi,
  putOnboardingStep,
} from "../api/client";
import { useAssessmentStream } from "../store/complianceStore";
import { useOrgContext } from "../hooks/useOrgContext";

type EntityDraft = { name: string; jurisdiction: string; role: string };

const FRAMEWORK_CARDS: Array<{
  id: string;
  name: string;
  version: string;
  jurisdiction: string;
  control_count: number;
  description: string;
}> = [
  {
    id: "gdpr-2016-679",
    name: "GDPR",
    version: "2016/679",
    jurisdiction: "EU",
    control_count: 25,
    description: "EU personal data protection and breach notification.",
  },
  {
    id: "nis2-2022-2555",
    name: "NIS2 Directive",
    version: "2022/2555",
    jurisdiction: "EU",
    control_count: 20,
    description: "Critical entities and incident reporting obligations.",
  },
  {
    id: "eu-ai-act-2024",
    name: "EU AI Act",
    version: "2024",
    jurisdiction: "EU",
    control_count: 31,
    description: "High-risk AI governance and human oversight.",
  },
  {
    id: "eu-cybersecurity-act",
    name: "EU Cybersecurity Act",
    version: "2019",
    jurisdiction: "EU",
    control_count: 22,
    description: "Certification and ICT supply chain resilience.",
  },
  {
    id: "cyber-essentials-v3.1",
    name: "Cyber Essentials",
    version: "v3.1",
    jurisdiction: "UK",
    control_count: 18,
    description: "UK baseline technical controls for organisations.",
  },
  {
    id: "iso27001-2022",
    name: "ISO/IEC 27001",
    version: "2022",
    jurisdiction: "International",
    control_count: 93,
    description: "Information security management system standard.",
  },
  {
    id: "nist-csf-2.0",
    name: "NIST CSF",
    version: "2.0",
    jurisdiction: "US",
    control_count: 106,
    description: "US cybersecurity framework outcomes and tiers.",
  },
  {
    id: "csa-ccm-v4",
    name: "CSA CCM",
    version: "v4.0",
    jurisdiction: "Cloud",
    control_count: 197,
    description: "Cloud control matrix for CSP assurance.",
  },
];

function presetFrameworkIds(jurisdiction: string): string[] {
  const j = jurisdiction.toUpperCase();
  if (j === "UK")
    return ["cyber-essentials-v3.1", "iso27001-2022"];
  if (j === "US") return ["nist-csf-2.0", "csa-ccm-v4"];
  if (["DE", "ES", "AU", "TH", "OTHER", "EU"].includes(j))
    return ["gdpr-2016-679", "nis2-2022-2555", "eu-ai-act-2024", "eu-cybersecurity-act"];
  return ALL_FRAMEWORK_IDS.split(",");
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { orgId } = useOrgContext();
  const jurisdiction =
    typeof window !== "undefined"
      ? localStorage.getItem("cortex_jurisdiction") ?? "EU"
      : "EU";

  const [step, setStep] = useState(1);
  const [structure, setStructure] = useState<"single" | "multi">("single");
  const [entities, setEntities] = useState<EntityDraft[]>([
    { name: "", jurisdiction: "DE", role: "Operating company" },
    { name: "", jurisdiction: "UK", role: "Subsidiary" },
  ]);
  const [selectedFw, setSelectedFw] = useState<Set<string>>(
    () => new Set(presetFrameworkIds(jurisdiction))
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { startStream, isStreaming } = useAssessmentStream();

  const stepTitles = useMemo(
    () => ["Company structure", "Frameworks", "First assessment"],
    []
  );

  const toggleFw = (id: string) => {
    setSelectedFw((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const persistStep1 = async () => {
    if (structure === "multi") {
      const filled = entities.filter((e) => e.name.trim());
      if (filled.length < 2) {
        setError("Add at least two entities for a multi-entity group.");
        return;
      }
    }
    setError("");
    setBusy(true);
    try {
      await putOnboardingStep({
        step: 1,
        data: {
          entity_structure: structure,
          entities: structure === "multi" ? entities : [],
        },
      });
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save step");
    } finally {
      setBusy(false);
    }
  };

  const persistStep2 = async () => {
    const fw = Array.from(selectedFw);
    if (fw.length === 0) {
      setError("Select at least one framework.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await putOnboardingStep({ step: 2, data: { frameworks: fw } });
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save step");
    } finally {
      setBusy(false);
    }
  };

  const skipAll = async () => {
    setBusy(true);
    try {
      await putOnboardingStep({ step: 3, data: {} });
      const raw = localStorage.getItem("cortex_user");
      if (raw) {
        const u = JSON.parse(raw) as Record<string, unknown>;
        u.onboarding_complete = true;
        u.onboarding_step = 3;
        localStorage.setItem("cortex_user", JSON.stringify(u));
      }
      navigate("/dashboard", { replace: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Skip failed");
    } finally {
      setBusy(false);
    }
  };

  const runFirst = async () => {
    const fw = Array.from(selectedFw);
    if (fw.length === 0) {
      setError("Select frameworks in the previous step.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await putOnboardingStep({ step: 3, data: {} });
      await assessmentsApi.run({ org_id: orgId, frameworks: fw });
      startStream(orgId, fw);
      const raw = localStorage.getItem("cortex_user");
      if (raw) {
        const u = JSON.parse(raw) as Record<string, unknown>;
        u.onboarding_complete = true;
        u.onboarding_step = 3;
        localStorage.setItem("cortex_user", JSON.stringify(u));
      }
      navigate("/dashboard", { replace: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Assessment failed to start");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#05080f", color: "#e2e8f4", fontFamily: "DM Sans, sans-serif" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid #141e30",
          background: "#090e1a",
        }}
      >
        <LogoFull size="md" />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {stepTitles.map((t, i) => (
            <span
              key={t}
              style={{
                fontSize: 11,
                fontFamily: "'DM Mono', monospace",
                color: i + 1 === step ? "#2dd4bf" : "#4a5a72",
              }}
            >
              {i + 1}. {t}
            </span>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 48px" }}>
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              borderRadius: 8,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.35)",
              color: "#fca5a5",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {step === 1 && (
          <section>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, marginBottom: 8 }}>
              How is your organisation structured?
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: 28 }}>
              Choose how CORTEX should model your compliance scope.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <button
                type="button"
                onClick={() => setStructure("single")}
                style={cardStyle(structure === "single")}
              >
                <div style={{ fontSize: 28 }}>🏢</div>
                <h2 style={{ fontSize: 18, margin: "12px 0 8px" }}>Single Entity</h2>
                <p style={{ color: "#94a3b8", fontSize: 14 }}>
                  One company, one jurisdiction — “I operate in one country”.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setStructure("multi")}
                style={cardStyle(structure === "multi")}
              >
                <div style={{ fontSize: 28 }}>🌍</div>
                <h2 style={{ fontSize: 18, margin: "12px 0 8px" }}>Multi-Entity Group</h2>
                <p style={{ color: "#94a3b8", fontSize: 14 }}>
                  Multiple entities across countries — “We have offices in 2+ countries”.
                </p>
              </button>
            </div>

            {structure === "multi" && (
              <div style={{ marginTop: 28 }}>
                <p style={{ color: "#94a3b8", marginBottom: 12, fontSize: 14 }}>
                  Add at least two entities (name, jurisdiction, role).
                </p>
                {entities.map((e, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr", gap: 8, marginBottom: 8 }}>
                    <input
                      placeholder="Entity name"
                      value={e.name}
                      onChange={(ev) => {
                        const next = [...entities];
                        next[idx] = { ...e, name: ev.target.value };
                        setEntities(next);
                      }}
                      style={inputStyle}
                    />
                    <input
                      placeholder="CC"
                      value={e.jurisdiction}
                      onChange={(ev) => {
                        const next = [...entities];
                        next[idx] = { ...e, jurisdiction: ev.target.value };
                        setEntities(next);
                      }}
                      style={inputStyle}
                    />
                    <input
                      placeholder="Role"
                      value={e.role}
                      onChange={(ev) => {
                        const next = [...entities];
                        next[idx] = { ...e, role: ev.target.value };
                        setEntities(next);
                      }}
                      style={inputStyle}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setEntities([...entities, { name: "", jurisdiction: "EU", role: "" }])
                  }
                  style={{
                    marginTop: 8,
                    background: "transparent",
                    border: "1px dashed #2dd4bf",
                    color: "#2dd4bf",
                    padding: "8px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  + Add another entity
                </button>
              </div>
            )}

            <div style={{ marginTop: 32 }}>
              <button type="button" disabled={busy} onClick={persistStep1} style={primaryBtn(busy)}>
                Continue →
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, marginBottom: 8 }}>
              Which regulations apply to you?
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: 24 }}>
              We will pre-assess your posture against these frameworks.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              {FRAMEWORK_CARDS.map((f) => (
                <label
                  key={f.id}
                  style={{
                    display: "flex",
                    gap: 14,
                    alignItems: "flex-start",
                    padding: 16,
                    borderRadius: 10,
                    border: selectedFw.has(f.id) ? "1px solid #2dd4bf" : "1px solid #141e30",
                    background: "#090e1a",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedFw.has(f.id)}
                    onChange={() => toggleFw(f.id)}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <strong>{f.name}</strong>
                      <span style={{ color: "#4a5a72", fontSize: 13 }}>{f.version}</span>
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: 1,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "#0e7490",
                          color: "#cffafe",
                        }}
                      >
                        {f.jurisdiction}
                      </span>
                      <span style={{ color: "#64748b", fontSize: 12 }}>{f.control_count} controls</span>
                    </div>
                    <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 6 }}>{f.description}</p>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 28, display: "flex", gap: 12 }}>
              <button type="button" disabled={busy} onClick={persistStep2} style={primaryBtn(busy)}>
                Continue →
              </button>
              <button type="button" onClick={() => setStep(1)} style={ghostBtn}>
                Back
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, marginBottom: 8 }}>
              You&apos;re ready. Let&apos;s assess.
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: 24 }}>
              CORTEX will assess your posture across {selectedFw.size} framework
              {selectedFw.size === 1 ? "" : "s"} (~2 minutes).
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
              {Array.from(selectedFw).map((id) => (
                <span
                  key={id}
                  style={{
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: "#0c1220",
                    border: "1px solid #1e2e48",
                  }}
                >
                  {id}
                </span>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || isStreaming}
              onClick={runFirst}
              style={{
                ...primaryBtn(busy || isStreaming),
                background: "linear-gradient(135deg, #0d9488, #2dd4bf)",
                fontSize: 16,
                padding: "14px 22px",
              }}
            >
              {isStreaming ? "Streaming…" : "Run First Assessment →"}
            </button>
            <div style={{ marginTop: 16 }}>
              <button type="button" onClick={skipAll} disabled={busy} style={{ ...ghostBtn, fontSize: 12 }}>
                Skip for now →
              </button>
            </div>
            <p style={{ marginTop: 24 }}>
              <button type="button" onClick={() => setStep(2)} style={ghostBtn}>
                Back
              </button>
            </p>
          </section>
        )}

      </main>
    </div>
  );
}

function cardStyle(active: boolean): CSSProperties {
  return {
    textAlign: "left" as const,
    padding: 24,
    borderRadius: 12,
    border: active ? "2px solid #2dd4bf" : "1px solid #141e30",
    background: "#090e1a",
    color: "#e2e8f4",
    cursor: "pointer",
  };
}

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #141e30",
  background: "#0c1220",
  color: "#e2e8f4",
  fontSize: 14,
};

function primaryBtn(disabled: boolean): CSSProperties {
  return {
    padding: "12px 20px",
    borderRadius: 8,
    border: "none",
    fontWeight: "bold",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.65 : 1,
    background: "linear-gradient(135deg, #2563eb, #3b82f6)",
  };
}

const ghostBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #1e2e48",
  background: "transparent",
  color: "#94a3b8",
  cursor: "pointer",
};
