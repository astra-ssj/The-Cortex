/**
 * Compliance store: posture, ZTAIP status, org profile, assessment stream.
 * Uses API client and TanStack Query; stream state is local.
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { AssessmentEvent } from "../types/compliance";
import {
  createAssessmentStream,
  fetchOrgProfile,
  fetchPosture,
  fetchZtaipStatus,
} from "../api/client";

// Query keys
export const postureQueryKey = (orgId: string) => ["posture", orgId] as const;
export const ztaipStatusQueryKey = ["ztaipStatus"] as const;
export const orgProfileQueryKey = (orgId: string) => ["orgProfile", orgId] as const;

export function useCompliancePosture(orgId: string | null) {
  return useQuery({
    queryKey: postureQueryKey(orgId ?? ""),
    queryFn: () => fetchPosture(orgId!),
    enabled: orgId != null && orgId !== "",
  });
}

export function useZtaipStatus() {
  return useQuery({
    queryKey: ztaipStatusQueryKey,
    queryFn: fetchZtaipStatus,
    staleTime: 30_000,
  });
}

export function useOrgProfile(orgId: string | null) {
  return useQuery({
    queryKey: orgProfileQueryKey(orgId ?? ""),
    queryFn: () => fetchOrgProfile(orgId!),
    enabled: orgId != null && orgId !== "",
  });
}

export function useAssessmentStream() {
  const [events, setEvents] = useState<AssessmentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const startStream = useCallback((organizationId: string, frameworkIds: string[]) => {
    setEvents([]);
    setIsStreaming(true);
    const es = createAssessmentStream(
      organizationId,
      frameworkIds,
      (event) => {
        console.log("Event received:", event);
        setEvents((prev) => [...prev, event]);
      },
      () => {
        setIsStreaming(false);
        es.close();
      }
    );
    es.addEventListener("run_done", () => {
      setIsStreaming(false);
      es.close();
    });
    es.addEventListener("error", () => {
      setIsStreaming(false);
      es.close();
    });
    setEventSource(es);
  }, []);

  const stopStream = useCallback(() => {
    eventSource?.close();
    setEventSource(null);
    setIsStreaming(false);
  }, [eventSource]);

  return { events, isStreaming, startStream, stopStream };
}
