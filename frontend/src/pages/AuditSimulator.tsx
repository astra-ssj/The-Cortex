import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import {
  AUDIT_FRAMEWORKS,
  AUDIT_TYPES,
  type AuditFrameworkSlug,
  type AuditTypeId,
} from "../lib/auditSimulator";

const panel: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-5)",
};

const eyebrow: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

export default function AuditSimulator() {
  const navigate = useNavigate();
  const [framework, setFramework] = useState<AuditFrameworkSlug | null>(null);
  const [auditType, setAuditType] = useState<AuditTypeId | null>(null);

  const runnable = framework !== null && auditType !== null;

  const onFramework = (slug: AuditFrameworkSlug, enabled: boolean) => {
    if (!enabled) return;
    setFramework(slug);
    setAuditType(null);
  };

  const onRun = () => {
    if (!runnable || !framework || !auditType) return;
    const params = new URLSearchParams({
      framework,
      audit_type: auditType,
    });
    navigate(`/learning?${params.toString()}`);
  };

  return (
    <div style={{ paddingTop: 8, maxWidth: 820 }}>
      <div style={{ ...eyebrow, marginBottom: 6 }}>TRAIN</div>
      <h1
        style={{
          margin: 0,
          fontSize: 24,
          fontWeight: 700,
          color: "var(--text)",
          fontFamily: "var(--font-sans)",
        }}
      >
        Audit Simulator
      </h1>
      <p style={{ margin: "8px 0 24px", color: "var(--text-secondary)", fontSize: 13, maxWidth: 560, lineHeight: 1.55 }}>
        Pick the framework and rehearsal type. The Learning Loop then offers the scenarios that
        match that frame.
      </p>

      <section style={{ ...panel, marginBottom: 20 }} aria-label="Framework selector">
        <div style={eyebrow}>Step A · Framework</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          {AUDIT_FRAMEWORKS.map((fw) => {
            const selected = framework === fw.slug && fw.enabled;
            return (
              <button
                key={fw.slug}
                type="button"
                onClick={() => onFramework(fw.slug, fw.enabled)}
                aria-pressed={selected}
                aria-disabled={!fw.enabled}
                tabIndex={fw.enabled ? 0 : -1}
                style={{
                  textAlign: "left",
                  background: selected ? "var(--blue-soft)" : "var(--bg)",
                  border: selected
                    ? "1px solid var(--blue)"
                    : "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 16,
                  cursor: fw.enabled ? "pointer" : "default",
                  color: "var(--text)",
                  opacity: fw.enabled ? 1 : 0.55,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{fw.label}</strong>
                    {fw.subtitle ? (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                        {fw.subtitle}
                      </div>
                    ) : null}
                  </div>
                  {!fw.enabled ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--amber)",
                        border: "1px solid color-mix(in srgb, var(--amber) 40%, transparent)",
                        borderRadius: 999,
                        padding: "2px 8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Coming Soon
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {framework ? (
        <section style={{ ...panel, marginBottom: 20 }} aria-label="Audit type selector">
          <div style={eyebrow}>Step B · Audit type</div>
          <div
            role="radiogroup"
            aria-label="Audit type"
            style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}
          >
            {AUDIT_TYPES.map((opt) => {
              const selected = auditType === opt.id;
              return (
                <label
                  key={opt.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: selected ? "1px solid var(--blue)" : "1px solid var(--border)",
                    background: selected ? "var(--blue-soft)" : "var(--bg)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: selected ? 600 : 500,
                    color: "var(--text)",
                  }}
                >
                  <input
                    type="radio"
                    name="audit-type"
                    value={opt.id}
                    checked={selected}
                    onChange={() => setAuditType(opt.id)}
                    style={{ accentColor: "var(--blue)" }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </section>
      ) : null}

      <Button variant="primary" size="lg" type="button" disabled={!runnable} onClick={onRun}>
        Run Assessment
      </Button>
    </div>
  );
}
