import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import AssessmentStream from "../components/AssessmentStream";
import { LogoFull } from "../components/Logo";
import type { FrameworkSummary } from "../api/frameworks";
import { assessmentsApi, putOnboardingStep } from "../api/client";
import { useFrameworks } from "../hooks/useFrameworks";
import { frameworkLabelFromId } from "../lib/frameworkRegistry";
import { invalidateComplianceData } from "../store/complianceStore";

type StructureType = "single" | "multi";

type EntityDraft = {
  flag: string;
  name: string;
  jurisdiction: string;
  role: string;
};

type FrameworkCard = {
  id: string;
  title: string;
  subtitle: string;
  control_count: number;
  description: string;
};

function summaryToCard(fw: FrameworkSummary): FrameworkCard {
  const subtitle = [fw.version, fw.jurisdiction].filter(Boolean).join(" · ");
  const description = fw.purpose_tags?.length ? fw.purpose_tags.join(", ") : fw.name;
  return {
    id: fw.id,
    title: fw.name,
    subtitle,
    control_count: fw.control_count,
    description,
  };
}

const JURIS_OPTIONS = ["DE", "UK", "AU", "TH", "ES", "US", "EU", "OTHER"] as const;

const FLAG_BY_JURISDICTION: Record<string, string> = {
  DE: "🇩🇪",
  UK: "🇬🇧",
  AU: "🇦🇺",
  TH: "🇹🇭",
  ES: "🇪🇸",
  US: "🇺🇸",
  EU: "🇪🇺",
  OTHER: "🏳️",
};

function getPresetFrameworks(jurisdiction: string): string[] {
  const j = jurisdiction.toUpperCase();
  if (["DE", "ES", "EU"].includes(j)) {
    return ["gdpr-2016-679", "nis2-2022-2555", "eu-ai-act-2024", "iso27001-2022"];
  }
  if (j === "UK") return ["cyber-essentials-v3.1", "iso27001-2022"];
  if (j === "US") return ["nist-csf-2.0", "csa-ccm-v4"];
  if (["AU", "TH"].includes(j)) return ["iso27001-2022", "nist-csf-2.0"];
  return ["iso27001-2022"];
}

export default function Onboarding() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const frameworksQuery = useFrameworks();

  const [step, setStep] = useState(1);
  const [structure, setStructure] = useState<StructureType | null>(null);
  const [entities, setEntities] = useState<EntityDraft[]>([]);
  const [frameworks, setFrameworks] = useState<string[]>(() => {
    const jurisdiction = localStorage.getItem("cortex_jurisdiction") ?? "OTHER";
    return getPresetFrameworks(jurisdiction);
  });
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [assessmentRunAccepted, setAssessmentRunAccepted] = useState(true);
  const [error, setError] = useState("");

  const orgId = localStorage.getItem("cortex_org_id") ?? "demo-org-001";

  const frameworkCards = useMemo(
    () => frameworksQuery.data?.map(summaryToCard) ?? [],
    [frameworksQuery.data],
  );

  useEffect(() => {
    const rows = frameworksQuery.data;
    if (!rows?.length) return;
    const allowed = new Set(rows.map((f) => f.id));
    setFrameworks((prev) => {
      const filtered = prev.filter((id) => allowed.has(id));
      if (filtered.length > 0) return filtered;
      const jurisdiction = localStorage.getItem("cortex_jurisdiction") ?? "OTHER";
      const preset = getPresetFrameworks(jurisdiction).filter((id) => allowed.has(id));
      return preset.length > 0 ? preset : [];
    });
  }, [frameworksQuery.data]);

  const totalControls = useMemo(
    () =>
      frameworks.reduce((sum, id) => sum + (frameworkCards.find((f) => f.id === id)?.control_count ?? 0), 0),
    [frameworks, frameworkCards],
  );

  async function handleRunAssessment() {
    setBusy(true);
    setError("");
    try {
      await assessmentsApi.run({ org_id: orgId, frameworks });
      setAssessmentRunAccepted(true);
      setStreaming(true);
    } catch (e) {
      // Surface the real failure instead of dropping the user into a misleading "running…" view.
      setError(e instanceof Error ? e.message : "Could not start the assessment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    setBusy(true);
    setError("");
    try {
      await putOnboardingStep({ step: 3 });
      localStorage.setItem("cortex_onboarding", JSON.stringify({ complete: true, step: 3 }));
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }


  const updateEntity = (index: number, patch: Partial<EntityDraft>) => {
    setEntities((prev) => prev.map((entity, idx) => (idx === index ? { ...entity, ...patch } : entity)));
  };

  const selectStructure = (value: StructureType) => {
    setStructure(value);
    if (value === "multi" && entities.length < 2) {
      setEntities([
        { flag: "🇩🇪", name: "", jurisdiction: "DE", role: "" },
        { flag: "🇬🇧", name: "", jurisdiction: "UK", role: "" },
      ]);
    }
  };

  const canContinueStep1 =
    structure === "single" ||
    (structure === "multi" &&
      entities.filter((entity) => entity.name.trim() && entity.jurisdiction && entity.role.trim()).length >= 2);

  const persistStep1 = async () => {
    if (!canContinueStep1 || !structure) return;
    setBusy(true);
    setError("");
    try {
      await putOnboardingStep({
        step: 1,
        data: {
          entity_structure: structure,
          entities: structure === "multi" ? entities : [],
        },
      });
      localStorage.setItem("cortex_onboarding", JSON.stringify({ complete: false, step: 1 }));
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save structure.");
    } finally {
      setBusy(false);
    }
  };

  const persistStep2 = async () => {
    if (frameworks.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await putOnboardingStep({ step: 2, data: { frameworks } });
      localStorage.setItem("cortex_onboarding", JSON.stringify({ complete: false, step: 2 }));
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save frameworks.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-sans)" }}>
      {streaming ? (
        <AssessmentStream
          orgName={localStorage.getItem("cortex_company") ?? "Your Organisation"}
          orgId={orgId}
          frameworks={frameworks}
          runAccepted={assessmentRunAccepted}
          onComplete={() => {
            void (async () => {
              try {
                await putOnboardingStep({ step: 3 });
              } catch {
                // Best-effort: the assessment already ran; proceed to the dashboard either way.
              }
              localStorage.setItem("cortex_onboarding", JSON.stringify({ complete: true, step: 3 }));

              invalidateComplianceData(queryClient, orgId);
              navigate("/dashboard", { replace: true });
            })();
          }}
        />
      ) : null}
      <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--border-subtle)", padding: "14px 24px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <LogoFull size="md" />
          <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
            Step {step} of 3
          </span>
        </div>
        <div style={{ width: "100%", height: 6, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
          <div style={{ width: `${(step / 3) * 100}%`, height: "100%", background: "var(--cyan)", transition: "width 0.25s ease" }} />
        </div>
      </header>

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "26px 24px 40px" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
          {["Structure", "Frameworks", "Assess"].map((label, index) => {
            const stepIndex = index + 1;
            const done = stepIndex < step;
            const active = stepIndex === step;
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: active ? "var(--cyan)" : done ? "var(--green)" : "var(--border)",
                    boxShadow: active ? "0 0 8px color-mix(in srgb, var(--cyan) 60%, transparent)" : "none",
                  }}
                />
                <span style={{ color: active ? "var(--text)" : "var(--text-secondary)", fontSize: 12 }}>{label}</span>
              </div>
            );
          })}
        </div>

        {error ? <div style={errorBanner}>{error}</div> : null}

        {step === 1 && (
          <section>
            <h1 style={h1Style}>How is your organisation structured?</h1>
            <p style={subStyle}>This determines how CORTEX maps your compliance posture.</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <button type="button" onClick={() => selectStructure("single")} style={optionCard(structure === "single")}> 
                <div style={{ fontSize: 34, marginBottom: 6 }}>🏢</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Single Entity</div>
                <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>One company, operating in one primary jurisdiction.</div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 8 }}>e.g. a startup or SMB</div>
              </button>

              <button type="button" onClick={() => selectStructure("multi")} style={optionCard(structure === "multi")}> 
                <div style={{ fontSize: 34, marginBottom: 6 }}>🌍</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Multi-Entity Group</div>
                <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Multiple entities across different countries.</div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 8 }}>e.g. international group with EU, UK, APAC offices</div>
              </button>
            </div>

            {structure === "multi" && (
              <div style={{ marginTop: 18, background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Add your entities</div>
                <div style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 12 }}>Add at least 2 entities</div>

                {entities.map((entity, index) => (
                  <div key={index} style={{ display: "grid", gridTemplateColumns: "70px 1fr 130px 1fr 34px", gap: 8, marginBottom: 8 }}>
                    <select
                      value={entity.flag}
                      onChange={(e) => updateEntity(index, { flag: e.target.value })}
                      style={inputStyle}
                    >
                      {Object.values(FLAG_BY_JURISDICTION).map((flag) => (
                        <option key={flag} value={flag}>{flag}</option>
                      ))}
                    </select>
                    <input value={entity.name} onChange={(e) => updateEntity(index, { name: e.target.value })} placeholder="Entity name" style={inputStyle} />
                    <select
                      value={entity.jurisdiction}
                      onChange={(e) =>
                        updateEntity(index, {
                          jurisdiction: e.target.value,
                          flag: FLAG_BY_JURISDICTION[e.target.value] ?? "🏳️",
                        })
                      }
                      style={inputStyle}
                    >
                      {JURIS_OPTIONS.map((j) => (
                        <option key={j} value={j}>{j}</option>
                      ))}
                    </select>
                    <input value={entity.role} onChange={(e) => updateEntity(index, { role: e.target.value })} placeholder="Role" style={inputStyle} />
                    <button
                      type="button"
                      onClick={() => setEntities((prev) => prev.filter((_, idx) => idx !== index))}
                      style={{ ...inputStyle, padding: 0, color: "var(--text-secondary)", cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setEntities((prev) => [...prev, { flag: "🇪🇺", name: "", jurisdiction: "EU", role: "" }])}
                  style={{ ...ghostStyle, border: "1px dashed var(--cyan)", color: "var(--cyan)" }}
                >
                  ＋ Add another entity
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" disabled={!canContinueStep1 || busy} onClick={persistStep1} style={primaryStyle(!canContinueStep1 || busy)}>
                Continue →
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 style={h1Style}>Which regulations apply to you?</h1>
            <p style={subStyle}>Pre-selected based on your jurisdiction. Adjust as needed.</p>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>{frameworks.length} frameworks selected</p>

            {frameworksQuery.isLoading && (
              <p style={{ color: "var(--text-tertiary)", fontSize: 13, marginBottom: 12 }}>Loading frameworks…</p>
            )}
            {frameworksQuery.isError && (
              <div style={{ ...errorBanner, marginBottom: 14 }}>
                {(frameworksQuery.error as Error).message}. Framework list requires GET /api/v1/frameworks.
              </div>
            )}
            {!frameworksQuery.isLoading && frameworkCards.length === 0 && !frameworksQuery.isError && (
              <p style={{ color: "var(--amber)", fontSize: 13, marginBottom: 12 }}>
                No frameworks returned from the API — you cannot continue until frameworks are available.
              </p>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {frameworkCards.map((framework) => {
                const checked = frameworks.includes(framework.id);
                return (
                  <button
                    key={framework.id}
                    type="button"
                    onClick={() => {
                      setFrameworks((prev) =>
                        prev.includes(framework.id)
                          ? prev.filter((id) => id !== framework.id)
                          : [...prev, framework.id]
                      );
                    }}
                    style={{
                      textAlign: "left",
                      border: checked ? "1px solid var(--cyan)" : "1px solid var(--border)",
                      background: checked ? "color-mix(in srgb, var(--cyan) 8%, transparent)" : "var(--surface)",
                      borderRadius: 10,
                      padding: 14,
                      color: "var(--text)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ color: checked ? "var(--cyan)" : "var(--text-tertiary)" }}>{checked ? "☑" : "☐"}</span>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{framework.title}</span>
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{framework.subtitle}</div>
                    <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{framework.control_count} controls</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{framework.description}</div>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
              <button type="button" onClick={() => setStep(1)} style={ghostStyle}>← Back</button>
              <button
                type="button"
                disabled={frameworks.length === 0 || busy || frameworksQuery.isLoading || frameworkCards.length === 0}
                onClick={persistStep2}
                style={primaryStyle(frameworks.length === 0 || busy || frameworksQuery.isLoading || frameworkCards.length === 0)}
              >
                Continue →
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 style={h1Style}>You&apos;re ready. Let&apos;s assess.</h1>
            <p style={subStyle}>CORTEX will assess your compliance posture across your selected frameworks.</p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginBottom: 14 }}>
              <StatCard title="Frameworks" value={String(frameworks.length)} />
              <StatCard title="Controls" value={String(totalControls)} />
              <StatCard title="Entities" value={String(structure === "multi" ? entities.length : 1)} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {frameworks.map((id) => (
                <span key={id} style={{ fontSize: 12, background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--cyan) 40%, transparent)", color: "var(--cyan)", borderRadius: 999, padding: "4px 10px" }}>
                  {frameworkLabelFromId(id)}
                </span>
              ))}
            </div>

            <button type="button" disabled={busy || streaming} onClick={handleRunAssessment} style={runAssessmentStyle(busy || streaming)}>
              ▶ Run First Assessment
            </button>

            <div style={{ marginTop: 12 }}>
              <button type="button" disabled={busy || streaming} onClick={() => void handleSkip()} style={{ ...ghostStyle, color: "var(--text-secondary)", fontSize: 12 }}>
                Skip for now →
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const h1Style: CSSProperties = {
  margin: 0,
  marginBottom: 6,
  fontSize: 28,
  fontFamily: "var(--font-sans)",
  letterSpacing: "0.2px",
};

const subStyle: CSSProperties = {
  marginTop: 0,
  color: "var(--text-secondary)",
  marginBottom: 16,
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  padding: "9px 10px",
  fontSize: 13,
};

function optionCard(active: boolean): CSSProperties {
  return {
    borderRadius: 10,
    border: active ? "1px solid var(--cyan)" : "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    boxShadow: active ? "0 0 14px color-mix(in srgb, var(--cyan) 18%, transparent)" : "none",
    padding: 16,
    textAlign: "left",
    cursor: "pointer",
  };
}

function primaryStyle(disabled: boolean): CSSProperties {
  return {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    color: "var(--bg)",
    background: "linear-gradient(135deg, color-mix(in srgb, var(--cyan) 60%, black), var(--cyan))",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.65 : 1,
    fontWeight: 700,
  };
}

const ghostStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

const errorBanner: CSSProperties = {
  marginBottom: 14,
  background: "color-mix(in srgb, var(--red) 15%, transparent)",
  border: "1px solid color-mix(in srgb, var(--red) 40%, transparent)",
  color: "var(--red)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 13,
};

function runAssessmentStyle(disabled: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "14px 18px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, color-mix(in srgb, var(--cyan) 60%, black), var(--cyan))",
    color: "var(--bg)",
    fontFamily: "var(--font-sans)",
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "2px",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
