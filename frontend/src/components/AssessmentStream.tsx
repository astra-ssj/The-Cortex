import { useEffect, useMemo, useRef, useState } from "react";
import type { AssessmentEvent } from "../types/compliance";
import { frameworkLabelFromId } from "../lib/frameworkRegistry";
import { useAssessmentStream } from "../store/complianceStore";
import { LogoIcon, LogoWordmark } from "./Logo";

export interface AssessmentStreamProps {
  orgName: string;
  orgId: string;
  frameworks: string[];
  /** POST /assessments/run succeeded — connect SSE. If false, show honest fallback only. */
  runAccepted: boolean;
  onComplete: () => void;
}

type LineCls = "ok" | "warn" | "crit" | "info";

function lineClassForEvent(ev: AssessmentEvent): LineCls {
  if (ev.kind === "error") return "crit";
  if (ev.kind === "control_result" && ev.status === "error") return "crit";
  if (ev.kind === "run_start" || ev.kind === "framework_start" || ev.kind === "run_done") return "info";
  return "ok";
}

function formatEventLine(ev: AssessmentEvent): string | null {
  switch (ev.kind) {
    case "run_start":
      return `[ZTAIP] Run started · ${ev.frameworkIds.length} framework(s) · ${ev.runId.slice(0, 8)}…`;
    case "framework_start":
      return `[ZTAIP] Assessing ${ev.frameworkName}…`;
    case "control_context":
      return null;
    case "control_result": {
      const skill = ev.skill_name ? ` · ${ev.skill_name}` : "";
      const conf =
        typeof ev.confidence === "number"
          ? ` · ${Math.round(ev.confidence * 100)}%`
          : "";
      const prov = ev.llm_provider ? ` · ${ev.llm_provider}` : "";
      return `[${ev.frameworkId}] ${ev.controlName} — ${ev.status}${conf}${prov}${skill}`;
    }
    case "framework_done":
      return `[ZTAIP] ${frameworkLabelFromId(ev.frameworkId)} — complete`;
    case "run_done":
      return `[ZTAIP] Assessment run finished · ${ev.runId.slice(0, 8)}…`;
    case "error":
      return `[ERROR] ${ev.controlId ?? "run"} — ${ev.message}`;
    default:
      return null;
  }
}

export default function AssessmentStream({
  orgName,
  orgId,
  frameworks,
  runAccepted,
  onComplete,
}: AssessmentStreamProps) {
  const { events, isStreaming, streamError, startStream, stopStream } = useAssessmentStream();
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const completedRef = useRef(false);
  const [showWaitingPrompt, setShowWaitingPrompt] = useState(false);

  useEffect(() => {
    if (!runAccepted) return;
    startStream(orgId, frameworks);
    return () => stopStream();
  }, [runAccepted, orgId, frameworks, startStream, stopStream]);

  useEffect(() => {
    if (!runAccepted) return;
    const t = window.setTimeout(() => setShowWaitingPrompt(true), 3000);
    return () => window.clearTimeout(t);
  }, [runAccepted]);

  useEffect(() => {
    if (events.length > 0) setShowWaitingPrompt(false);
  }, [events.length]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [events]);

  useEffect(() => {
    if (completedRef.current) return;
    if (!events.some((e) => e.kind === "run_done")) return;
    completedRef.current = true;
    const t = window.setTimeout(() => onCompleteRef.current(), 600);
    return () => window.clearTimeout(t);
  }, [events]);

  const lines = useMemo(() => {
    const out: Array<{ id: string; cls: LineCls; text: string }> = [];
    let n = 0;
    for (const ev of events) {
      const text = formatEventLine(ev);
      if (!text) continue;
      out.push({
        id: `${n++}-${ev.kind}`,
        cls: lineClassForEvent(ev),
        text,
      });
    }
    return out;
  }, [events]);

  const fwMetrics = useMemo(() => {
    const m: Record<string, { label: string; controls: number; done: boolean }> = {};
    for (const fid of frameworks) {
      m[fid] = { label: frameworkLabelFromId(fid), controls: 0, done: false };
    }
    for (const ev of events) {
      if (ev.kind === "framework_start") {
        m[ev.frameworkId] = {
          label: ev.frameworkName,
          controls: m[ev.frameworkId]?.controls ?? 0,
          done: false,
        };
      }
      if (ev.kind === "control_result") {
        const cur = m[ev.frameworkId] ?? { label: frameworkLabelFromId(ev.frameworkId), controls: 0, done: false };
        m[ev.frameworkId] = { ...cur, controls: cur.controls + 1 };
      }
      if (ev.kind === "framework_done") {
        const cur = m[ev.frameworkId] ?? { label: frameworkLabelFromId(ev.frameworkId), controls: 0, done: false };
        m[ev.frameworkId] = { ...cur, done: true };
      }
    }
    return m;
  }, [events, frameworks]);

  const totalControlsAssessed = useMemo(
    () => events.filter((e): e is Extract<AssessmentEvent, { kind: "control_result" }> => e.kind === "control_result").length,
    [events],
  );

  if (!runAccepted || streamError) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          zIndex: 1000,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 28px",
            height: "52px",
            background: "var(--sidebar)",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <LogoWordmark fontSize={15} />
          </span>
        </header>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            textAlign: "center",
            gap: 20,
          }}
        >
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--text-secondary)", maxWidth: 440, lineHeight: 1.6 }}>
            Your first assessment is running in the background. Results will appear on your dashboard shortly.
          </p>
          <button
            type="button"
            onClick={() => onCompleteRef.current()}
            style={{
              padding: "12px 22px",
              borderRadius: 10,
              border: "none",
              background: "var(--blue)",
              color: "var(--on-accent)",
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Go to Dashboard
          </button>
          {streamError ? (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>{streamError}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          height: "52px",
          background: "var(--sidebar)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <LogoIcon size={26} />
          <LogoWordmark fontSize={15} />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--green)",
            letterSpacing: "1px",
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "var(--green)",
              boxShadow: "0 0 8px var(--green)",
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
            borderRight: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--border-subtle)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--text-quiet)",
              letterSpacing: "1px",
            }}
          >
            ZTAIP — AI Assessment Engine {isStreaming ? "· LIVE" : ""}
          </div>
          <div
            ref={bodyRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 20px",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              lineHeight: "1.9",
            }}
          >
            {showWaitingPrompt && lines.length === 0 ? (
              <div style={{ color: "var(--text-tertiary)", marginBottom: 12 }}>
                Waiting for assessment to start…
              </div>
            ) : null}
            {lines.map((line) => (
              <div
                key={line.id}
                style={{
                  animation: "fadeIn 0.2s forwards",
                  color:
                    line.cls === "ok"
                      ? "var(--green)"
                      : line.cls === "crit"
                        ? "var(--red)"
                        : line.cls === "warn"
                          ? "var(--amber)"
                          : line.cls === "info"
                            ? "var(--cyan)"
                            : "var(--cyan)",
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
                background: "var(--cyan)",
                animation: "blink 1s infinite",
                verticalAlign: "middle",
              }}
            />
          </div>
        </div>

        <div style={{ flex: "0 0 40%", padding: "24px 20px", overflowY: "auto" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--text-quiet)",
              letterSpacing: "2px",
              marginBottom: "16px",
            }}
          >
            FRAMEWORK ACTIVITY
          </div>

          {frameworks.map((fwId) => {
            const meta = fwMetrics[fwId] ?? {
              label: frameworkLabelFromId(fwId),
              controls: 0,
              done: false,
            };
            const pct = meta.done ? 100 : Math.min(96, meta.controls > 0 ? 12 + meta.controls * 3 : 0);
            const color = meta.done ? "var(--green)" : meta.controls > 0 ? "var(--cyan)" : "var(--text-quiet)";

            return (
              <div
                key={fwId}
                style={{
                  background: "var(--card)",
                  border:
                    meta.controls > 0 || meta.done
                      ? `1px solid color-mix(in srgb, ${color} 27%, transparent)`
                      : "1px solid var(--border-subtle)",
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
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>{meta.label}</div>
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontWeight: 700,
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      minWidth: "52px",
                      textAlign: "right",
                    }}
                  >
                    {meta.controls > 0 ? `${meta.controls} ctrl` : meta.done ? "Done" : "—"}
                  </div>
                </div>

                <div style={{ height: "3px", background: "var(--border-subtle)", borderRadius: "2px", overflow: "hidden" }}>
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

                {meta.done ? (
                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "10px",
                      color: "var(--green)",
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.5px",
                    }}
                  >
                    ● Framework stream complete
                  </div>
                ) : null}
              </div>
            );
          })}

          {totalControlsAssessed > 0 ? (
            <div
              style={{
                background: "var(--card)",
                border: "1px solid color-mix(in srgb, var(--cyan) 27%, transparent)",
                borderRadius: "8px",
                padding: "16px",
                marginTop: "8px",
                textAlign: "center",
                animation: "fadeIn 0.5s forwards",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--cyan)",
                  letterSpacing: "2px",
                  marginBottom: "8px",
                }}
              >
                RUN PROGRESS
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "28px", color: "var(--cyan)" }}>
                {totalControlsAssessed}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                controls assessed (live stream)
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
