import { useEffect, useRef, useState } from "react";

export interface AssessmentStreamProps {
  orgName: string;
  orgId: string;
  frameworks: string[];
  onComplete: () => void;
}

type LineCls = "ok" | "warn" | "crit" | "info";

const FW_META: Record<
  string,
  {
    name: string;
    short: string;
    score: number;
    color: string;
    lines: Array<{ delay: number; cls: LineCls; text: string }>;
  }
> = {
  "gdpr-2016-679": {
    name: "GDPR 2016/679",
    short: "GDPR",
    score: 58,
    color: "#f59e0b",
    lines: [
      { delay: 0, cls: "ok", text: "[GDPR] Art.5   — Data processing principles ......... COMPLIANT    [conf: 0.91]" },
      { delay: 300, cls: "ok", text: "[GDPR] Art.6   — Lawful basis for processing ........ COMPLIANT    [conf: 0.88]" },
      { delay: 600, cls: "warn", text: "[GDPR] Art.32  — Security of processing ............. PARTIAL      [conf: 0.69] → review" },
      { delay: 900, cls: "crit", text: "[GDPR] Art.33  — 72-hour breach notification ........ NON_COMPLIANT [conf: 0.58] → review ⚠" },
      { delay: 1200, cls: "warn", text: "[GDPR] Art.44  — International transfers ............ PARTIAL      [conf: 0.71] → review" },
    ],
  },
  "nis2-2022-2555": {
    name: "NIS2 Directive",
    short: "NIS2",
    score: 44,
    color: "#ef4444",
    lines: [
      { delay: 0, cls: "warn", text: "[NIS2] Art.21(1) — Risk management measures ......... PARTIAL      [conf: 0.67]" },
      { delay: 300, cls: "crit", text: "[NIS2] Art.23(4)(a) — 24h CSIRT notification ........ NON_COMPLIANT [conf: 0.61] → review ⚠" },
      { delay: 600, cls: "crit", text: "[NIS2] Art.21(2)(d) — Supply chain security ......... NON_COMPLIANT [conf: 0.64] → review ⚠" },
      { delay: 900, cls: "warn", text: "[NIS2] Art.21(2)(e) — Network security measures ..... PARTIAL      [conf: 0.72]" },
    ],
  },
  "iso27001-2022": {
    name: "ISO/IEC 27001:2022",
    short: "ISO 27001",
    score: 62,
    color: "#f59e0b",
    lines: [
      { delay: 0, cls: "ok", text: "[ISO]  A.5.1   — Information security policies ...... COMPLIANT    [conf: 0.94]" },
      { delay: 300, cls: "ok", text: "[ISO]  A.5.15  — Access control policy .............. COMPLIANT    [conf: 0.91]" },
      { delay: 600, cls: "ok", text: "[ISO]  A.6.1   — Screening .......................... COMPLIANT    [conf: 0.89]" },
      { delay: 900, cls: "warn", text: "[ISO]  A.8.8   — Management of vulnerabilities ....... PARTIAL      [conf: 0.68] → review" },
      { delay: 1200, cls: "warn", text: "[ISO]  A.5.23  — Cloud information security ......... PARTIAL      [conf: 0.71] → review" },
    ],
  },
  "eu-ai-act-2024": {
    name: "EU AI Act 2024",
    short: "EU AI Act",
    score: 41,
    color: "#ef4444",
    lines: [
      { delay: 0, cls: "crit", text: "[EUAI] Art.9   — Risk management system ............. NON_COMPLIANT [conf: 0.55] → review ⚠" },
      { delay: 300, cls: "crit", text: "[EUAI] Art.14  — Human oversight mechanism .......... NON_COMPLIANT [conf: 0.52] → review ⚠" },
      { delay: 600, cls: "warn", text: "[EUAI] Art.13  — Transparency obligations ........... PARTIAL      [conf: 0.66]" },
      { delay: 900, cls: "warn", text: "[EUAI] Art.17  — Quality management system .......... PARTIAL      [conf: 0.68]" },
    ],
  },
  "nist-csf-2.0": {
    name: "NIST CSF 2.0",
    short: "NIST CSF",
    score: 67,
    color: "#f59e0b",
    lines: [
      { delay: 0, cls: "ok", text: "[NIST] ID.AM-1 — Asset inventory .................... COMPLIANT    [conf: 0.93]" },
      { delay: 300, cls: "ok", text: "[NIST] PR.AC-1 — Identity management ............... COMPLIANT    [conf: 0.87]" },
      { delay: 600, cls: "ok", text: "[NIST] DE.CM-1 — Network monitoring ................ COMPLIANT    [conf: 0.85]" },
      { delay: 900, cls: "warn", text: "[NIST] RS.RP-1 — Response plan ..................... PARTIAL      [conf: 0.70]" },
    ],
  },
  "cyber-essentials-v3.1": {
    name: "Cyber Essentials v3.1",
    short: "Cyber Ess.",
    score: 78,
    color: "#10b981",
    lines: [
      { delay: 0, cls: "ok", text: "[CE]   Firewalls and internet gateways .............. PARTIAL      [conf: 0.81]" },
      { delay: 300, cls: "ok", text: "[CE]   Secure configuration ........................ COMPLIANT    [conf: 0.86]" },
      { delay: 600, cls: "ok", text: "[CE]   Access control .............................. COMPLIANT    [conf: 0.91]" },
      { delay: 900, cls: "ok", text: "[CE]   Malware protection ......................... COMPLIANT    [conf: 0.88]" },
    ],
  },
  "csa-ccm-v4": {
    name: "CSA CCM v4.0",
    short: "CSA CCM",
    score: 61,
    color: "#f59e0b",
    lines: [
      { delay: 0, cls: "ok", text: "[CSA]  AIS-01  — Application security .............. COMPLIANT    [conf: 0.84]" },
      { delay: 300, cls: "warn", text: "[CSA]  IVS-04  — Network security .................. PARTIAL      [conf: 0.69]" },
      { delay: 600, cls: "warn", text: "[CSA]  DSP-07  — Data classification ............... PARTIAL      [conf: 0.71]" },
    ],
  },
  "eu-cybersecurity-act": {
    name: "EU Cybersecurity Act",
    short: "EU Cyber",
    score: 55,
    color: "#f59e0b",
    lines: [
      { delay: 0, cls: "ok", text: "[EUCA] Art.46  — Certification schemes ............. PARTIAL      [conf: 0.73]" },
      { delay: 300, cls: "warn", text: "[EUCA] Art.49  — Assurance levels .................. PARTIAL      [conf: 0.67]" },
    ],
  },
};

function buildTimeline(frameworks: string[], orgName: string, orgId: string) {
  const timeline: Array<{
    time: number;
    cls: LineCls;
    text: string;
    fwId?: string;
  }> = [];

  timeline.push(
    { time: 100, cls: "info", text: `[ZTAIP] Initialising assessment engine v2.4.1` },
    { time: 400, cls: "info", text: `[ZTAIP] Connected to ${orgName} · ${orgId}` },
    { time: 700, cls: "info", text: `[ZTAIP] Loading ${frameworks.length} frameworks` },
  );

  const fw_budget = (8000 - 700 - 800) / Math.max(frameworks.length, 1);

  frameworks.forEach((fwId, fwIdx) => {
    const meta = FW_META[fwId];
    if (!meta) return;

    const fwStart = 700 + fwIdx * fw_budget;

    timeline.push({
      time: fwStart,
      cls: "info",
      text: `[ZTAIP] Assessing ${meta.name}...`,
    });

    meta.lines.forEach((line) => {
      timeline.push({
        time: fwStart + 200 + line.delay,
        cls: line.cls,
        text: line.text,
      });
    });

    timeline.push({
      time: fwStart + fw_budget - 100,
      cls: "ok",
      text: `[ZTAIP] ${meta.short} complete → score: ${meta.score}%`,
      fwId,
    });
  });

  const footerStart = 8000 - 800;
  const reviewCount =
    frameworks.filter((id) => (FW_META[id]?.score ?? 100) < 65).length * 2;

  timeline.push(
    { time: footerStart, cls: "info", text: `[ZTAIP] Assessment complete · all frameworks processed` },
    { time: footerStart + 200, cls: "warn", text: `[ZTAIP] ${reviewCount} items queued for human review` },
    { time: footerStart + 400, cls: "ok", text: `[ZTAIP] Audit fabric updated · findings logged` },
    { time: footerStart + 600, cls: "info", text: `[ZTAIP] Redirecting to dashboard...` },
  );

  return timeline;
}

export default function AssessmentStream({ orgName, orgId, frameworks, onComplete }: AssessmentStreamProps) {
  const [lines, setLines] = useState<Array<{ cls: LineCls; text: string; id: number }>>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [overallScore, setOverallScore] = useState(0);
  const [done, setDone] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lineId = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const frameworksWithMeta = frameworks.filter((id): id is string => Boolean(FW_META[id]));

  useEffect(() => {
    const timeline = buildTimeline(frameworks, orgName, orgId);
    const timers: ReturnType<typeof setTimeout>[] = [];

    timeline.forEach((event) => {
      const t = setTimeout(() => {
        const id = lineId.current++;
        setLines((prev) => [...prev, { cls: event.cls, text: event.text, id }]);
        if (bodyRef.current) {
          bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
        if (event.fwId) {
          const score = FW_META[event.fwId]?.score ?? 0;
          setScores((prev) => ({ ...prev, [event.fwId!]: score }));
        }
      }, event.time);
      timers.push(t);
    });

    const avgTimer = setTimeout(() => {
      const known = frameworks.filter((id) => FW_META[id]);
      const avg = Math.round(
        known.reduce((sum, id) => sum + (FW_META[id]?.score ?? 0), 0) / Math.max(known.length, 1),
      );
      setOverallScore(avg);
    }, 7400);
    timers.push(avgTimer);

    const doneTimer = setTimeout(() => {
      setDone(true);
      setTimeout(() => {
        onCompleteRef.current();
      }, 600);
    }, 8200);
    timers.push(doneTimer);

    return () => timers.forEach(clearTimeout);
  }, [frameworks, orgName, orgId]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#04070d",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        opacity: done ? 0 : 1,
        transition: "opacity 0.6s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          height: "52px",
          background: "#080e18",
          borderBottom: "1px solid #131f32",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="26" height="26" viewBox="0 0 80 80" fill="none" style={{ filter: "drop-shadow(0 0 6px rgba(45,212,191,0.5))" }}>
            <path d="M 13 40 A 27 27 0 1 1 67 40" stroke="#2dd4bf" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path
              d="M 21 40 A 19 19 0 1 1 59 40"
              stroke="#2dd4bf"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              opacity="0.6"
            />
            <path
              d="M 29 40 A 11 11 0 1 1 51 40"
              stroke="#2dd4bf"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              opacity="0.3"
            />
            <circle cx="40" cy="40" r="4.5" fill="#2dd4bf" />
            <circle cx="13" cy="40" r="3" fill="#2dd4bf" opacity="0.5" />
            <circle cx="67" cy="40" r="3" fill="#2dd4bf" opacity="0.5" />
          </svg>
          <span
            style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: "15px",
              letterSpacing: "3px",
              color: "#e2e8f4",
            }}
          >
            CORTEX
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontFamily: "'Space Mono', monospace",
            fontSize: "11px",
            color: "#10b981",
            letterSpacing: "1px",
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 8px #10b981",
              animation: "pulse 2s infinite",
              display: "inline-block",
            }}
          />
          ASSESSING {orgName.toUpperCase()}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div
          style={{
            flex: "0 0 60%",
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid #131f32",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid #131f32",
              fontFamily: "'Space Mono', monospace",
              fontSize: "11px",
              color: "#3a4a60",
              letterSpacing: "1px",
            }}
          >
            ZTAIP — AI Assessment Engine
          </div>
          <div
            ref={bodyRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 20px",
              fontFamily: "'Space Mono', monospace",
              fontSize: "11px",
              lineHeight: "1.9",
            }}
          >
            {lines.map((line) => (
              <div
                key={line.id}
                style={{
                  animation: "fadeIn 0.2s forwards",
                  color:
                    line.cls === "ok" ? "#10b981" : line.cls === "crit" ? "#ef4444" : line.cls === "warn" ? "#f59e0b" : "#2dd4bf",
                }}
              >
                {line.text}
              </div>
            ))}
            <span
              style={{
                display: "inline-block",
                width: "8px",
                height: "14px",
                background: "#2dd4bf",
                animation: "blink 1s infinite",
                verticalAlign: "middle",
              }}
            />
          </div>
        </div>

        <div style={{ flex: "0 0 40%", padding: "24px 20px", overflowY: "auto" }}>
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "10px",
              color: "#3a4a60",
              letterSpacing: "2px",
              marginBottom: "16px",
            }}
          >
            FRAMEWORK POSTURE
          </div>

          {frameworksWithMeta.map((fwId) => {
            const meta = FW_META[fwId];
            if (!meta) return null;
            const score = scores[fwId] ?? 0;
            const pct = score;
            const color = score >= 70 ? "#10b981" : score >= 50 ? "#f59e0b" : score > 0 ? "#ef4444" : "#3a4a60";

            return (
              <div
                key={fwId}
                style={{
                  background: "#0d1628",
                  border: `1px solid ${score > 0 ? `${color}44` : "#131f32"}`,
                  borderRadius: "8px",
                  padding: "14px 16px",
                  marginBottom: "10px",
                  transition: "all 0.5s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f4" }}>{meta.name}</div>
                  </div>
                  <div
                    style={{
                      fontFamily: "'Syne', sans-serif",
                      fontWeight: 800,
                      fontSize: "20px",
                      color: score > 0 ? color : "#3a4a60",
                      transition: "color 0.5s ease",
                      minWidth: "48px",
                      textAlign: "right",
                    }}
                  >
                    {score > 0 ? `${score}%` : "—"}
                  </div>
                </div>

                <div style={{ height: "3px", background: "#131f32", borderRadius: "2px", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      borderRadius: "2px",
                      background: color,
                      width: `${pct}%`,
                      transition: "width 1s ease",
                    }}
                  />
                </div>

                {score > 0 ? (
                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "10px",
                      color,
                      fontFamily: "'Space Mono', monospace",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {score >= 70 ? "● PARTIAL" : score >= 50 ? "● PARTIAL — HIGH" : "● NON-COMPLIANT — CRITICAL"}
                  </div>
                ) : null}
              </div>
            );
          })}

          {overallScore > 0 ? (
            <div
              style={{
                background: "#0d1628",
                border: "1px solid #2dd4bf44",
                borderRadius: "8px",
                padding: "16px",
                marginTop: "8px",
                textAlign: "center",
                animation: "fadeIn 0.5s forwards",
              }}
            >
              <div
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "10px",
                  color: "#2dd4bf",
                  letterSpacing: "2px",
                  marginBottom: "8px",
                }}
              >
                OVERALL POSTURE
              </div>
              <div
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: "40px",
                  color: overallScore >= 70 ? "#10b981" : overallScore >= 50 ? "#f59e0b" : "#ef4444",
                }}
              >
                {overallScore}%
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#8898aa",
                  marginTop: "4px",
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                Assessment complete
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%,50%  { opacity: 1; }
          51%,100%{ opacity: 0; }
        }
        @keyframes pulse {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
