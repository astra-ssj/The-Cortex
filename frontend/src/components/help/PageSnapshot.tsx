import type { CSSProperties, ReactNode } from "react";

export type SnapshotVariant =
  | "login"
  | "register"
  | "onboarding-structure"
  | "onboarding-frameworks"
  | "onboarding-assess"
  | "assessment-stream"
  | "dashboard"
  | "sidebar"
  | "frameworks"
  | "findings"
  | "review-queue"
  | "command-palette";

export interface PageSnapshotProps {
  variant: SnapshotVariant;
  caption?: string;
}

const frame: CSSProperties = {
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  overflow: "hidden",
  boxShadow: "0 12px 40px color-mix(in srgb, var(--bg) 30%, transparent)",
};

const chromeBar: CSSProperties = {
  display: "flex",
  gap: 6,
  padding: "10px 12px",
  borderBottom: "1px solid var(--border-subtle)",
  background: "var(--surface)",
};

const dot = (color: string): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: color,
});

function SnapshotChrome({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={frame} role="img" aria-label={`Illustration: ${title}`}>
      <div style={chromeBar}>
        <span style={dot("#ef4444")} />
        <span style={dot("#f59e0b")} />
        <span style={dot("#22c55e")} />
        <span
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 11,
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function MiniLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--text-tertiary)",
      }}
    >
      {children}
    </span>
  );
}

function SnapshotBody({ children }: { children: ReactNode }) {
  return <div style={{ padding: 14 }}>{children}</div>;
}

function LoginRegisterBody({ mode }: { mode: "login" | "register" }) {
  const fields =
    mode === "register"
      ? ["Company name", "Jurisdiction", "Industry", "Full name", "Work email", "Password"]
      : ["Work email", "Password"];
  return (
    <SnapshotBody>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "linear-gradient(135deg, var(--cyan), color-mix(in srgb, var(--cyan) 40%, black))",
          }}
        />
        <div style={{ fontWeight: 700, fontSize: 15 }}>{mode === "login" ? "Sign in to CORTEX" : "Create your organisation"}</div>
        <div style={{ width: "100%", maxWidth: 280, display: "flex", flexDirection: "column", gap: 6 }}>
          {fields.map((f) => (
            <div
              key={f}
              style={{
                height: 28,
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--card)",
                padding: "0 10px",
                display: "flex",
                alignItems: "center",
                fontSize: 11,
                color: "var(--text-tertiary)",
              }}
            >
              {f}
            </div>
          ))}
          <div
            style={{
              marginTop: 4,
              height: 32,
              borderRadius: 6,
              background: "linear-gradient(135deg, color-mix(in srgb, var(--cyan) 60%, black), var(--cyan))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--bg)",
            }}
          >
            {mode === "login" ? "Sign in" : "Create account"}
          </div>
        </div>
      </div>
    </SnapshotBody>
  );
}

function OnboardingStructure() {
  return (
    <SnapshotBody>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>How is your organisation structured?</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {["Single Entity", "Multi-Entity Group"].map((label, i) => (
          <div
            key={label}
            style={{
              padding: 10,
              borderRadius: 8,
              border: i === 0 ? "1px solid var(--cyan)" : "1px solid var(--border)",
              background: i === 0 ? "color-mix(in srgb, var(--cyan) 8%, transparent)" : "var(--surface)",
              fontSize: 11,
            }}
          >
            <div style={{ fontSize: 18, marginBottom: 4 }}>{i === 0 ? "🏢" : "🌍"}</div>
            <div style={{ fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, height: 4, borderRadius: 999, background: "var(--border)" }}>
        <div style={{ width: "33%", height: "100%", borderRadius: 999, background: "var(--cyan)" }} />
      </div>
    </SnapshotBody>
  );
}

function OnboardingFrameworks() {
  const fw = ["GDPR", "NIS2", "EU AI Act", "ISO 27001"];
  return (
    <SnapshotBody>
      <MiniLabel>Step 2 of 3 — Frameworks</MiniLabel>
      <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 0 8px" }}>Which regulations apply to you?</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {fw.map((name, i) => (
          <div
            key={name}
            style={{
              padding: 8,
              borderRadius: 6,
              border: i < 3 ? "1px solid var(--cyan)" : "1px solid var(--border)",
              fontSize: 10,
              background: i < 3 ? "color-mix(in srgb, var(--cyan) 6%, transparent)" : "var(--surface)",
            }}
          >
            <span style={{ color: i < 3 ? "var(--cyan)" : "var(--text-tertiary)" }}>{i < 3 ? "☑" : "☐"} </span>
            {name}
          </div>
        ))}
      </div>
    </SnapshotBody>
  );
}

function OnboardingAssess() {
  return (
    <SnapshotBody>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>You&apos;re ready. Let&apos;s assess.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
        {[
          ["Frameworks", "4"],
          ["Controls", "312"],
          ["Entities", "1"],
        ].map(([k, v]) => (
          <div key={k} style={{ padding: 8, borderRadius: 6, background: "var(--surface)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{k}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          height: 36,
          borderRadius: 8,
          background: "linear-gradient(135deg, color-mix(in srgb, var(--cyan) 60%, black), var(--cyan))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 12,
          color: "var(--bg)",
        }}
      >
        ▶ Run First Assessment
      </div>
    </SnapshotBody>
  );
}

function AssessmentStream() {
  return (
    <SnapshotBody>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Live assessment stream</div>
      {[
        { t: "Connecting to ZTAIP…", c: "var(--amber)" },
        { t: "GDPR Art.32 — PARTIAL (0.82)", c: "var(--cyan)" },
        { t: "NIS2 Art.21 — NON_COMPLIANT (0.61)", c: "var(--red)" },
        { t: "Run complete — posture refreshed", c: "var(--green)" },
      ].map((row) => (
        <div
          key={row.t}
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            padding: "4px 8px",
            marginBottom: 4,
            borderLeft: `2px solid ${row.c}`,
            color: "var(--text-secondary)",
          }}
        >
          {row.t}
        </div>
      ))}
    </SnapshotBody>
  );
}

function DashboardSnapshot() {
  return (
    <SnapshotBody>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
        {[
          ["Posture", "68%"],
          ["Audit ready", "54%"],
          ["Critical gaps", "7"],
          ["Frameworks", "4"],
        ].map(([k, v]) => (
          <div key={k} style={{ padding: 8, borderRadius: 6, background: "var(--surface)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{k}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: k === "Posture" ? "var(--cyan)" : "var(--text)" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>Framework compliance</div>
      {["GDPR", "NIS2", "EU AI Act"].map((fw, i) => (
        <div
          key={fw}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 8px",
            marginBottom: 4,
            borderRadius: 4,
            background: "var(--surface)",
            fontSize: 10,
          }}
        >
          <span>{fw}</span>
          <span style={{ color: i === 2 ? "var(--red)" : "var(--amber)" }}>{i === 0 ? "72%" : i === 1 ? "61%" : "48%"}</span>
        </div>
      ))}
    </SnapshotBody>
  );
}

function SidebarSnapshot() {
  const sections = [
    { label: "POSTURE", items: ["Dashboard", "Frameworks", "Findings"] },
    { label: "GOVERNANCE", items: ["Review Queue", "Remediation"] },
    { label: "OPERATIONS", items: ["Roadmap", "Settings"] },
  ];
  return (
    <div style={{ display: "flex", minHeight: 160 }}>
      <div
        style={{
          width: 120,
          background: "var(--sidebar)",
          borderRight: "1px solid var(--border)",
          padding: "10px 8px",
          fontSize: 10,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--cyan)" }}>CORTEX</div>
        {sections.map((s) => (
          <div key={s.label} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 8, color: "var(--text-tertiary)", marginBottom: 4 }}>{s.label}</div>
            {s.items.map((item, i) => (
              <div
                key={item}
                style={{
                  padding: "4px 6px",
                  borderRadius: 4,
                  marginBottom: 2,
                  background: i === 0 && s.label === "POSTURE" ? "var(--card)" : "transparent",
                  borderLeft: i === 0 && s.label === "POSTURE" ? "2px solid var(--cyan)" : "2px solid transparent",
                  color: i === 0 && s.label === "POSTURE" ? "var(--text)" : "var(--text-secondary)",
                }}
              >
                {item}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, padding: 12, background: "var(--shell)" }}>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Main content area</div>
      </div>
    </div>
  );
}

function GenericListSnapshot({ title, rows }: { title: string; rows: [string, string, string][] }) {
  return (
    <SnapshotBody>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 6, overflow: "hidden" }}>
        {rows.map(([a, b, c], i) => (
          <div
            key={a}
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr 0.6fr",
              gap: 8,
              padding: "6px 8px",
              fontSize: 10,
              borderTop: i ? "1px solid var(--border-subtle)" : undefined,
              background: i % 2 ? "var(--surface)" : "transparent",
            }}
          >
            <span>{a}</span>
            <span style={{ color: "var(--text-secondary)" }}>{b}</span>
            <span style={{ textAlign: "right", color: c.includes("HIGH") ? "var(--red)" : "var(--amber)" }}>{c}</span>
          </div>
        ))}
      </div>
    </SnapshotBody>
  );
}

function CommandPaletteSnapshot() {
  return (
    <SnapshotBody>
      <div
        style={{
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--elevated)",
          padding: 10,
          maxWidth: 320,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--cyan)",
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginBottom: 8,
          }}
        >
          Search pages, frameworks, actions…
        </div>
        {["Dashboard", "Run assessment", "GDPR"].map((row, i) => (
          <div
            key={row}
            style={{
              padding: "6px 8px",
              borderRadius: 4,
              fontSize: 10,
              background: i === 0 ? "color-mix(in srgb, var(--cyan) 12%, transparent)" : "transparent",
            }}
          >
            {row}
          </div>
        ))}
        <div style={{ marginTop: 8, fontSize: 9, color: "var(--text-tertiary)", textAlign: "center" }}>⌘K / Ctrl+K</div>
      </div>
    </SnapshotBody>
  );
}

const TITLES: Record<SnapshotVariant, string> = {
  login: "cortex.app/login",
  register: "cortex.app/register",
  "onboarding-structure": "cortex.app/onboarding — Step 1",
  "onboarding-frameworks": "cortex.app/onboarding — Step 2",
  "onboarding-assess": "cortex.app/onboarding — Step 3",
  "assessment-stream": "Assessment stream",
  dashboard: "cortex.app/dashboard",
  sidebar: "Application layout",
  frameworks: "cortex.app/frameworks",
  findings: "cortex.app/findings",
  "review-queue": "cortex.app/review-queue",
  "command-palette": "Command palette",
};

function SnapshotContent({ variant }: { variant: SnapshotVariant }) {
  switch (variant) {
    case "login":
      return <LoginRegisterBody mode="login" />;
    case "register":
      return <LoginRegisterBody mode="register" />;
    case "onboarding-structure":
      return <OnboardingStructure />;
    case "onboarding-frameworks":
      return <OnboardingFrameworks />;
    case "onboarding-assess":
      return <OnboardingAssess />;
    case "assessment-stream":
      return <AssessmentStream />;
    case "dashboard":
      return <DashboardSnapshot />;
    case "sidebar":
      return <SidebarSnapshot />;
    case "frameworks":
      return (
        <GenericListSnapshot
          title="Framework library"
          rows={[
            ["GDPR 2016/679", "EU · 99 controls", "72%"],
            ["NIS2 2022/2555", "EU · 42 controls", "61%"],
            ["EU AI Act 2024", "EU · 68 controls", "48%"],
          ]}
        />
      );
    case "findings":
      return (
        <GenericListSnapshot
          title="Findings & remediation"
          rows={[
            ["Incident reporting gap", "NIS2 Art.23", "HIGH"],
            ["Breach procedure missing", "GDPR Art.33", "HIGH"],
            ["MFA not enforced", "ISO A.8.5", "MEDIUM"],
          ]}
        />
      );
    case "review-queue":
      return (
        <GenericListSnapshot
          title="Human review queue"
          rows={[
            ["GDPR Art.22 decision", "0.68 confidence", "Pending"],
            ["AI Act Art.9 risk", "0.71 confidence", "Pending"],
            ["NIS2 supply chain", "0.74 confidence", "Pending"],
          ]}
        />
      );
    case "command-palette":
      return <CommandPaletteSnapshot />;
    default:
      return null;
  }
}

export function PageSnapshot({ variant, caption }: PageSnapshotProps) {
  const title = TITLES[variant];
  const inner = <SnapshotContent variant={variant} />;
  return (
    <figure style={{ margin: "16px 0 0" }}>
      {variant === "sidebar" ? (
        <div style={frame} role="img" aria-label={`Illustration: ${title}`}>
          {inner}
        </div>
      ) : (
        <SnapshotChrome title={title}>{inner}</SnapshotChrome>
      )}
      {caption ? (
        <figcaption
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--text-tertiary)",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
