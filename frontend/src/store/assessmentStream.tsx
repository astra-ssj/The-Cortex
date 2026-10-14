/**
 * Shared assessment SSE stream.
 *
 * This was previously a plain hook holding local useState, which meant every
 * caller got its own isolated instance. TopBar could start a run and then
 * navigate to a page whose own instance knew nothing about it, so the run
 * executed server-side while the UI showed nothing. One provider, one stream:
 * whoever starts it, everyone sees it.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchEventSource } from "@microsoft/fetch-event-source";

import type { AssessmentEvent } from "../types/compliance";
import { buildStreamUrl, getToken } from "../api/client";
import { invalidateComplianceData } from "./complianceStore";

export interface AssessmentStreamValue {
  events: AssessmentEvent[];
  isStreaming: boolean;
  isReconnecting: boolean;
  isCircuitBreakerOpen: boolean;
  streamError: string | null;
  clearStreamError: () => void;
  startStream: (organizationId: string, frameworkIds: string[]) => void;
  stopStream: () => void;
}

const AssessmentStreamContext = createContext<AssessmentStreamValue | null>(null);

const MAX_RECONNECT_ATTEMPTS = 3;

export function AssessmentStreamProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<AssessmentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isCircuitBreakerOpen, setIsCircuitBreakerOpen] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const startStream = useCallback(
    (organizationId: string, frameworkIds: string[]) => {
      setStreamError(null);
      setIsCircuitBreakerOpen(false);
      setIsReconnecting(false);
      reconnectAttemptsRef.current = 0;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setEvents([]);
      setIsStreaming(true);
      const url = buildStreamUrl(organizationId, frameworkIds);
      const token = getToken();

      void (async () => {
        try {
          await fetchEventSource(url, {
            signal: ac.signal,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            async onopen(response) {
              if (response.ok && response.status === 200) {
                // Connection established, reset retries
                reconnectAttemptsRef.current = 0;
                setIsReconnecting(false);
                return;
              }
              // Check for circuit-breaker open or rate limiting
              if (response.status === 429 || response.status === 503) {
                setIsCircuitBreakerOpen(true);
                setStreamError(
                  "Circuit breaker active: background evaluation is running with backpressure mitigation. Results will sync to dashboard.",
                );
                setIsStreaming(false);
                setIsReconnecting(false);
                invalidateComplianceData(queryClient, organizationId);
                ac.abort();
                return;
              }
              if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                // Client errors (e.g. 401, 404) should not retry
                throw new Error(`SSE client error: HTTP ${response.status}`);
              }
            },
            onmessage(ev) {
              if (!ev.data?.trim()) return;
              try {
                const data = JSON.parse(ev.data) as AssessmentEvent;
                if (data && typeof data === "object" && "kind" in data) {
                  // Partial stream recovery: deduplicate run_start or framework_start if reconnected
                  setEvents((prev) => {
                    if (data.kind === "run_start" && prev.some((e) => e.kind === "run_start")) {
                      return prev;
                    }
                    if (data.kind === "control_result") {
                      // Avoid duplicate control results on reconnect
                      const exists = prev.some(
                        (e) =>
                          e.kind === "control_result" &&
                          e.frameworkId === data.frameworkId &&
                          e.controlId === data.controlId,
                      );
                      if (exists) return prev;
                    }
                    return [...prev, data];
                  });

                  if (data.kind === "run_done") {
                    invalidateComplianceData(queryClient, organizationId);
                    setIsStreaming(false);
                    setIsReconnecting(false);
                    abortRef.current = null;
                    ac.abort();
                  }
                }
              } catch {
                // ignore parse errors
              }
            },
            onerror(err) {
              if (ac.signal.aborted) return;
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttemptsRef.current += 1;
                setIsReconnecting(true);
                // Return without re-throwing to let fetchEventSource retry with backoff
                return;
              }

              // Retries exhausted
              setStreamError(
                err instanceof Error ? err.message : "Live stream connection lost. Results continue processing in background.",
              );
              invalidateComplianceData(queryClient, organizationId);
              setIsStreaming(false);
              setIsReconnecting(false);
              abortRef.current = null;
              throw err;
            },
          });
        } catch (e) {
          if (!ac.signal.aborted) {
            setStreamError(e instanceof Error ? e.message : String(e));
            invalidateComplianceData(queryClient, organizationId);
            setIsStreaming(false);
            setIsReconnecting(false);
            abortRef.current = null;
          }
        }
      })();
    },
    [queryClient],
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setIsReconnecting(false);
  }, []);

  const clearStreamError = useCallback(() => setStreamError(null), []);

  const value = useMemo(
    () => ({
      events,
      isStreaming,
      isReconnecting,
      isCircuitBreakerOpen,
      streamError,
      clearStreamError,
      startStream,
      stopStream,
    }),
    [
      events,
      isStreaming,
      isReconnecting,
      isCircuitBreakerOpen,
      streamError,
      clearStreamError,
      startStream,
      stopStream,
    ],
  );

  return (
    <AssessmentStreamContext.Provider value={value}>{children}</AssessmentStreamContext.Provider>
  );
}


/**
 * Throws outside a provider rather than returning an inert stream. A silent
 * no-op is how the previous version hid a dead Run Assessment button for so
 * long; failing loudly at mount is cheaper than debugging a run that vanishes.
 */
export function useAssessmentStream(): AssessmentStreamValue {
  const ctx = useContext(AssessmentStreamContext);
  if (ctx === null) {
    throw new Error("useAssessmentStream must be used within an AssessmentStreamProvider");
  }
  return ctx;
}
