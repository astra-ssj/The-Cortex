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
  streamError: string | null;
  clearStreamError: () => void;
  startStream: (organizationId: string, frameworkIds: string[]) => void;
  stopStream: () => void;
}

const AssessmentStreamContext = createContext<AssessmentStreamValue | null>(null);

export function AssessmentStreamProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<AssessmentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    (organizationId: string, frameworkIds: string[]) => {
      setStreamError(null);
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
            onmessage(ev) {
              if (!ev.data?.trim()) return;
              try {
                const data = JSON.parse(ev.data) as AssessmentEvent;
                if (data && typeof data === "object" && "kind" in data) {
                  setEvents((prev) => [...prev, data]);
                  if (data.kind === "run_done") {
                    invalidateComplianceData(queryClient, organizationId);
                    setIsStreaming(false);
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
              setStreamError(err instanceof Error ? err.message : String(err));
              invalidateComplianceData(queryClient, organizationId);
              setIsStreaming(false);
              abortRef.current = null;
              throw err;
            },
          });
        } catch (e) {
          setStreamError(e instanceof Error ? e.message : String(e));
          invalidateComplianceData(queryClient, organizationId);
          setIsStreaming(false);
          abortRef.current = null;
        }
      })();
    },
    [queryClient],
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const clearStreamError = useCallback(() => setStreamError(null), []);

  const value = useMemo(
    () => ({ events, isStreaming, streamError, clearStreamError, startStream, stopStream }),
    [events, isStreaming, streamError, clearStreamError, startStream, stopStream],
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
