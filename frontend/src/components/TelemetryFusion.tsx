import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";

type ImpactKind = "score_drop" | "score_up" | "finding" | "incident_threshold";

type SignalTemplate = {
  source: string;
  severity: Severity;
  icon: string;
  text: string;
  control: string;
  article: string;
  impact: ImpactKind;
  drop: number;
};

const SIGNAL_POOL: SignalTemplate[] = [
  {
    source: "Microsoft 365",
    severity: "HIGH",
    icon: "🔷",
    text: "MFA disabled for 3 admin accounts",
    control: "ISO 27001 A.5.17",
    article: "NIS2 Art.21(2)(i)",
    impact: "score_drop",
    drop: 2,
  },
  {
    source: "AWS",
    severity: "CRITICAL",
    icon: "🟠",
    text: "S3 bucket made public: prod-backups-de",
    control: "ISO 27001 A.8.24",
    article: "GDPR Art.32",
    impact: "score_drop",
    drop: 3,
  },
  {
    source: "GitHub",
    severity: "HIGH",
    icon: "⚫",
    text: "Secret exposed in commit abc1234: API key",
    control: "ISO 27001 A.8.12",
    article: "NIS2 Art.21(2)(e)",
    impact: "score_drop",
    drop: 2,
  },
  {
    source: "Azure",
    severity: "MEDIUM",
    icon: "🔵",
    text: "Conditional Access policy modified by non-admin",
    control: "ISO 27001 A.5.15",
    article: "NIS2 Art.21(2)(a)",
    impact: "finding",
    drop: 1,
  },
  {
    source: "Microsoft 365",
    severity: "CRITICAL",
    icon: "🔷",
    text: "47 failed login attempts: ciso@astralabs.de",
    control: "ISO 27001 A.8.15",
    article: "NIS2 Art.23 (reportable incident threshold)",
    impact: "incident_threshold",
    drop: 0,
  },
  {
    source: "Slack",
    severity: "MEDIUM",
    icon: "🟣",
    text: "External user added to #security-alerts channel",
    control: "ISO 27001 A.5.14",
    article: "GDPR Art.32(1)(b)",
    impact: "finding",
    drop: 1,
  },
  {
    source: "AWS",
    severity: "HIGH",
    icon: "🟠",
    text: "CloudTrail logging disabled in eu-west-1",
    control: "ISO 27001 A.8.15",
    article: "NIS2 Art.21(2)(g)",
    impact: "score_drop",
    drop: 2,
  },
  {
    source: "Google Workspace",
    severity: "INFO",
    icon: "🟢",
    text: "Security health check passed: 98% MFA coverage",
    control: "ISO 27001 A.5.17",
    article: "NIS2 Art.21(2)(i)",
    impact: "score_up",
    drop: -1,
  },
];

const SOURCES = [
  { name: "Microsoft 365", dot: "#2dd4bf", mock: true, count: 2 },
  { name: "GitHub", dot: "#a855f7", mock: true, count: 1 },
  { name: "AWS", dot: "#f97316", mock: true, count: 3 },
  { name: "Azure", dot: "#3b82f6", mock: true, count: 1 },
  { name: "Google Workspace", dot: "#22c55e", mock: true, count: 0 },
  { name: "Slack", dot: "#e879f9", mock: true, count: 1 },
] as const;

function severityColor(sev: Severity): string {
  switch (sev) {
    case "CRITICAL":
      return "#ef4444";
    case "HIGH":
      return "#f59e0b";
    case "MEDIUM":
      return "#3b82f6";
    default:
      return "#2dd4bf";
  }
}

type FeedEntry = SignalTemplate & { id: string; ts: number };

type ControlHit = {
  id: string;
  control: string;
  source: string;
  article: string;
  severity: Severity;
  ts: number;
};

export function TelemetryFusion() {
  const [now, setNow] = useState(() => Date.now());
  const [paused, setPaused] = useState(false);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [score, setScore] = useState(58);
  const sessionStartScore = useRef(58);
  const [signalsReceived, setSignalsReceived] = useState(0);
  const [controlsAffectedCount, setControlsAffectedCount] = useState(0);
  const affectedControlsRef = useRef<Set<string>>(new Set());
  const [controlHits, setControlHits] = useState<ControlHit[]>([]);
  const [lastTrend, setLastTrend] = useState<"down" | "up" | "flat">("flat");
  const [incidentBanner, setIncidentBanner] = useState(false);
  const [incidentProgress, setIncidentProgress] = useState(0);
  const poolIndexRef = useRef(0);
  const incidentResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushSignal = useCallback(() => {
    const idx = poolIndexRef.current % SIGNAL_POOL.length;
    const tmpl = SIGNAL_POOL[idx];
    if (!tmpl) return;
    poolIndexRef.current += 1;
    const entry: FeedEntry = {
      ...tmpl,
      id: `${tmpl.source}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ts: Date.now(),
    };

    setFeed((prev) => [entry, ...prev].slice(0, 20));
    setSignalsReceived((n) => n + 1);

    if (tmpl.impact === "score_drop") {
      setScore((s) => Math.max(0, Math.round((s - tmpl.drop) * 10) / 10));
      setLastTrend("down");
    } else if (tmpl.impact === "score_up") {
      setScore((s) => Math.min(100, Math.round((s - tmpl.drop) * 10) / 10));
      setLastTrend("up");
    } else if (tmpl.impact === "finding") {
      setLastTrend("flat");
    }

    if (tmpl.impact === "incident_threshold") {
      setIncidentBanner(true);
      window.setTimeout(() => setIncidentBanner(false), 12000);
    }

    if (tmpl.severity === "CRITICAL") {
      setIncidentProgress((p) => Math.min(100, p + 25));
      if (incidentResetRef.current) {
        clearTimeout(incidentResetRef.current);
      }
      incidentResetRef.current = window.setTimeout(() => {
        setIncidentProgress(0);
        incidentResetRef.current = null;
      }, 60_000);
    }

    const ctrlKey = tmpl.control;
    setControlHits((prev) => {
      const next: ControlHit[] = [
        {
          id: entry.id,
          control: tmpl.control,
          source: tmpl.source,
          article: tmpl.article,
          severity: tmpl.severity,
          ts: entry.ts,
        },
        ...prev.filter((c) => c.control !== tmpl.control),
      ].slice(0, 8);
      return next;
    });

    if (!affectedControlsRef.current.has(ctrlKey)) {
      affectedControlsRef.current.add(ctrlKey);
      setControlsAffectedCount(affectedControlsRef.current.size);
    }
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    pushSignal();
    const id = window.setInterval(pushSignal, 8000);
    return () => window.clearInterval(id);
  }, [paused, pushSignal]);

  useEffect(
    () => () => {
      if (incidentResetRef.current) clearTimeout(incidentResetRef.current);
    },
    [],
  );

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const scoreDelta = Math.round((score - sessionStartScore.current) * 10) / 10;
  const scoreColor =
    score >= 70 ? "#22c55e" : score >= 50 ? "#fbbf24" : "#ef4444";

  const thresholdLabel =
    incidentProgress >= 100
      ? "NOTIFY BSI NOW"
      : incidentProgress >= 80
        ? "REVIEW REQUIRED"
        : incidentProgress >= 60
          ? "APPROACHING THRESHOLD"
          : "Monitoring";

  const thresholdTone =
    incidentProgress >= 100 ? "#ef4444" : incidentProgress >= 80 ? "#ef4444" : incidentProgress >= 60 ? "#f59e0b" : "#64748b";

  const panel: CSSProperties = {
    background: "#0b1220",
    border: "1px solid #141e30",
    borderRadius: 12,
    padding: 16,
  };

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "stretch", flexWrap: "wrap" }}>
      {incidentBanner && (
        <div
          style={{
            flexBasis: "100%",
            padding: "12px 16px",
            borderRadius: 10,
            background: "linear-gradient(90deg, #450a0a, #7f1d1d)",
            border: "1px solid #ef4444",
            color: "#fecaca",
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.45,
          }}
          role="alert"
        >
          ⚠ NIS2 Art.23 threshold — 24-hour reporting window may be triggered. Review required.
        </div>
      )}

      <aside style={{ flex: "1 1 220px", maxWidth: "100%", ...panel }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700 }}>Signal Sources</h2>
        <p style={{ margin: "0 0 14px", fontSize: 11, color: "var(--dim)", lineHeight: 1.45 }}>
          Mock data · Epic 3 wires real signals
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SOURCES.map((s) => (
            <div
              key={s.name}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "#070d18",
                border: "1px solid #1e293b",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: s.dot,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.name}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: s.mock ? "#422006" : "#042f2e",
                    color: s.mock ? "#fbbf24" : "#2dd4bf",
                  }}
                >
                  {s.mock ? "MOCK" : "LIVE"}
                </span>
                <span style={{ fontSize: 11, color: "var(--dim)" }}>{s.count} signals today</span>
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: "14px 0 0", fontSize: 11, color: "var(--dim)", fontStyle: "italic", lineHeight: 1.5 }}>
          When you connect real integrations, live signals replace mock data automatically.
        </p>
      </aside>

      <section style={{ flex: "1.8 1 360px", minWidth: 280, ...panel }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Control Telemetry Feed</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 11, color: "var(--dim)" }}>Auto-generating mock signals</span>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #1e293b",
                background: paused ? "#164e63" : "#1e293b",
                color: "#e2e8f0",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {paused ? "Resume ▶" : "Pause ⏸"}
            </button>
          </div>
        </div>
        <div
          style={{
            fontFamily: '"Space Mono", monospace',
            fontSize: 11,
            background: "#030712",
            border: "1px solid #1e293b",
            borderRadius: 8,
            padding: 12,
            minHeight: 320,
            maxHeight: 420,
            overflowY: "auto",
            lineHeight: 1.6,
          }}
        >
          {feed.length === 0 ? (
            <div style={{ color: "#475569" }}>Awaiting signals…</div>
          ) : (
            feed.map((line) => (
              <div key={line.id} style={{ marginBottom: 10, wordBreak: "break-word" }}>
                <span style={{ color: "#64748b" }}>
                  {new Date(line.ts).toISOString().replace("T", " ").slice(0, 19)}
                </span>
                <span style={{ color: "#94a3b8" }}> | </span>
                <span style={{ color: "#cbd5e1" }}>{line.icon}</span>
                <span style={{ color: "#cbd5e1" }}> {line.source}</span>
                <span style={{ color: "#94a3b8" }}> | </span>
                <span style={{ color: severityColor(line.severity), fontWeight: 700 }}>{line.severity}</span>
                <span style={{ color: "#94a3b8" }}> | </span>
                <span style={{ color: "#e2e8f0" }}>{line.text}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <aside style={{ flex: "1 1 260px", maxWidth: "100%", ...panel }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Live Posture Impact</h2>

        <div
          style={{
            padding: 16,
            borderRadius: 10,
            background: "#070d18",
            border: "1px solid #1e293b",
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 8 }}>Overall simulated score</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 42,
                fontWeight: 800,
                color: scoreColor,
                transition: "color 0.35s ease",
              }}
            >
              {score.toFixed(score % 1 === 0 ? 0 : 1)}%
            </span>
            <span style={{ fontSize: 22, color: lastTrend === "down" ? "#ef4444" : lastTrend === "up" ? "#22c55e" : "#475569" }}>
              {lastTrend === "down" ? "↓" : lastTrend === "up" ? "↑" : "→"}
            </span>
          </div>
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#cbd5e1",
            display: "grid",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--dim)" }}>Signals received</span>
            <span>{signalsReceived}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--dim)" }}>Controls affected</span>
            <span>{controlsAffectedCount}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <span style={{ color: "var(--dim)" }}>Score change</span>
            <span style={{ textAlign: "right" }}>
              <span style={{ color: scoreDelta <= 0 ? "#f87171" : "#4ade80", fontWeight: 600 }}>
                {scoreDelta >= 0 ? "+" : ""}
                {scoreDelta}%
              </span>
              <span style={{ color: "var(--dim)", fontSize: 11, marginLeft: 6 }}>since session start</span>
            </span>
          </div>
        </div>

        <h3 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>Affected controls</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {controlHits.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--dim)" }}>No control impacts yet.</div>
          ) : (
            controlHits.map((c) => {
              const isNew = now - c.ts < 30_000;
              return (
                <div
                  key={c.id}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    background: "#070d18",
                    border: "1px solid #1e293b",
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: `${severityColor(c.severity)}22`,
                        color: severityColor(c.severity),
                      }}
                    >
                      {c.severity}
                    </span>
                    <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{c.control}</span>
                    {isNew && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "#164e63",
                          color: "#5eead4",
                        }}
                      >
                        NEW
                      </span>
                    )}
                  </div>
                  <div style={{ color: "var(--dim)" }}>
                    Source: {c.source}
                    <br />
                    Article: <span style={{ color: "#5eead4" }}>{c.article}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <h3 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>NIS2 Reportable Event Tracker</h3>
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "#070d18",
            border: "1px solid #1e293b",
          }}
        >
          <div style={{ height: 10, borderRadius: 999, background: "#1e293b", overflow: "hidden", marginBottom: 10 }}>
            <div
              style={{
                height: "100%",
                width: `${incidentProgress}%`,
                borderRadius: 999,
                background:
                  incidentProgress >= 80
                    ? "linear-gradient(90deg,#dc2626,#f97316)"
                    : incidentProgress >= 60
                      ? "linear-gradient(90deg,#d97706,#fbbf24)"
                      : "linear-gradient(90deg,#0891b2,#2dd4bf)",
                transition: "width 0.45s ease",
              }}
            />
          </div>
          <div
            className={incidentProgress >= 100 ? "intelligence-threshold-notify" : undefined}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: thresholdTone,
            }}
          >
            {thresholdLabel} ({incidentProgress}%)
          </div>
        </div>
      </aside>
    </div>
  );
}
