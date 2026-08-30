/**
 * Live log for an assessment run.
 *
 * Renders nothing until a run starts or fails, so it costs no vertical space on
 * a page nobody is assessing from. This is the only surface that shows a run in
 * progress — without it the Run Assessment buttons fire a request and report
 * nothing back, which is how the previous build lost every run's output.
 */

import { useEffect, useRef } from "react";
import type { AssessmentEvent } from "../types/compliance";
import { eventDisplay, streamEventColor } from "../lib/complianceDashboardUtils";
import { Button } from "./ui/Button";

export interface AssessmentStreamLogProps {
  events: AssessmentEvent[];
  isStreaming: boolean;
  streamError: string | null;
  onDismissError: () => void;
  onStop: () => void;
}

export function AssessmentStreamLog({
  events,
  isStreaming,
  streamError,
  onDismissError,
  onStop,
}: AssessmentStreamLogProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (events.length > 0 && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [events.length]);

  if (!isStreaming && events.length === 0 && streamError === null) return null;

  return (
    <section
      className="mt-6 rounded-lg border"
      style={{ background: "var(--panel)", borderColor: "var(--border)" }}
      aria-labelledby="assessment-run-heading"
    >
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-2"
        style={{ borderColor: "var(--border)" }}
      >
        <h2
          id="assessment-run-heading"
          className="text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: "var(--text-quiet)" }}
        >
          Assessment run {isStreaming ? "· live" : events.length > 0 ? "· finished" : ""}
        </h2>
        {isStreaming ? (
          <Button type="button" variant="secondary" size="sm" onClick={onStop}>
            Stop
          </Button>
        ) : null}
      </div>

      {streamError ? (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <p className="m-0 text-[13px]" style={{ color: "var(--red)" }}>
            {streamError}
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={onDismissError}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {isStreaming || events.length > 0 ? (
        <div
          ref={bodyRef}
          className="overflow-y-auto"
          style={{
            padding: "var(--space-4)",
            background: "var(--surface)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-caption)",
            color: "var(--text-quiet)",
            maxHeight: 320,
          }}
          aria-live={isStreaming ? "polite" : "off"}
          tabIndex={0}
          role="log"
          aria-label="Assessment event stream"
        >
          {isStreaming && events.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", padding: "2px 0" }}>Connecting…</div>
          ) : null}
          {events.map((event, i) => {
            const { type, message } = eventDisplay(event);
            return (
              <div
                key={i}
                style={{
                  color: streamEventColor(type),
                  padding: "2px 0",
                  borderBottom: "1px solid var(--panel)",
                }}
              >
                [{type}] {message}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
