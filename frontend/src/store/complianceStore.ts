/**
 * Compliance data: TanStack Query hooks, query keys, and cache invalidation.
 * Stream state for assessments is local to useAssessmentStream.
 */

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { AssessmentEvent, CompliancePosture, ZTAIPStatus } from "../types/compliance";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import {
  buildStreamUrl,
  getToken,
  organisationsApi,
  reviewQueueQueryKey,
  ztaipApi,
} from "../api/client";

// Query keys
export const postureQueryKey = (orgId: string) => ["posture", orgId] as const;
export const ztaipStatusQueryKey = ["ztaipStatus"] as const;
export const orgProfileQueryKey = (orgId: string) => ["orgProfile", orgId] as const;

/** Refresh posture, ZTAIP, and review queue after SSE assessment runs or related mutations. */
export function invalidateComplianceData(queryClient: QueryClient, orgId: string | null | undefined): void {
  void queryClient.invalidateQueries({ queryKey: ztaipStatusQueryKey });
  const id = orgId?.trim();
  if (id) {
    void queryClient.invalidateQueries({ queryKey: postureQueryKey(id) });
    void queryClient.invalidateQueries({ queryKey: reviewQueueQueryKey(id) });
  }
}

/** API returns camelCase (serialize_by_alias=True). Support both for robustness. */
function mapPostureResponse(raw: Record<string, unknown>): CompliancePosture {
  const frameworks = (raw.frameworks as Record<string, unknown>[] | undefined) ?? [];
  const orgId = String(raw.organisationId ?? raw.org_id ?? "");
  const orgName = String(raw.organisationName ?? raw.org_name ?? "");
  const updatedAt = String(raw.updatedAt ?? raw.updated_at ?? raw.lastAssessed ?? raw.last_assessed ?? "");
  const lastAssessed = raw.lastAssessed ?? raw.last_assessed;
  const overallScore = typeof (raw.overallScore ?? raw.overall_score) === "number" ? (raw.overallScore ?? raw.overall_score) as number : undefined;
  const auditReadiness = typeof (raw.auditReadiness ?? raw.audit_readiness) === "number" ? (raw.auditReadiness ?? raw.audit_readiness) as number : undefined;
  const overallRisk =
    typeof (raw.riskLevel ?? raw.risk_level) === "string"
      ? (raw.riskLevel ?? raw.risk_level) as CompliancePosture["overallRiskLevel"]
      : undefined;
  const postureMessage =
    typeof (raw.message ?? raw.Message) === "string" ? String(raw.message ?? raw.Message) : undefined;
  const criticalGapsRaw = raw.criticalGaps ?? raw.critical_gaps;
  const criticalGapsCount = Array.isArray(criticalGapsRaw)
    ? criticalGapsRaw.length
    : frameworks.reduce((sum, f) => sum + (typeof (f.gapCount ?? f.gap_count) === "number" ? (f.gapCount ?? f.gap_count) as number : 0), 0);

  return {
    organisationId: orgId,
    organisationName: orgName,
    updatedAt: String(updatedAt),
    lastAssessed: lastAssessed != null ? String(lastAssessed) : undefined,
    overallScore,
    auditReadiness,
    overallRiskLevel: overallRisk,
    message: postureMessage,
    criticalGapsCount,
    frameworks: frameworks.map((f: Record<string, unknown>) => ({
      frameworkId: String(f.frameworkId ?? f.framework_id ?? ""),
      frameworkName: String(f.frameworkName ?? f.framework_name ?? ""),
      controlCount: typeof (f.controlCount ?? f.control_count) === "number" ? (f.controlCount ?? f.control_count) as number : 0,
      controls: [],
      score: typeof (f.score) === "number" ? f.score : undefined,
      gapCount: typeof (f.gapCount ?? f.gap_count) === "number" ? (f.gapCount ?? f.gap_count) as number : undefined,
      status: typeof (f.status) === "string" ? (f.status as "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT") : undefined,
      riskLevel: typeof (f.riskLevel ?? f.risk_level) === "string" ? (f.riskLevel ?? f.risk_level) as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" : undefined,
      trend: typeof (f.trend) === "number" ? f.trend : undefined,
      jurisdiction: typeof (f.jurisdiction) === "string" ? f.jurisdiction : undefined,
    })),
  };
}

export function useCompliancePosture(orgId: string | null) {
  return useQuery({
    queryKey: postureQueryKey(orgId ?? ""),
    queryFn: async () => {
      const raw = await organisationsApi.getPosture(orgId ?? undefined);
      return mapPostureResponse(raw as Record<string, unknown>);
    },
    enabled: orgId != null && orgId !== "",
    refetchInterval: 60_000,
  });
}

function mapZtaipResponse(raw: Record<string, unknown>): ZTAIPStatus {
  const af = (raw.auditFabric ?? raw.audit_fabric) as Record<string, unknown> | undefined;
  return {
    auditFabric: {
      totalEvents: Number(af?.totalEvents ?? af?.total_events ?? 0),
      lastEventAt:
        (af?.lastEventAt ?? af?.last_event_at) != null
          ? String(af?.lastEventAt ?? af?.last_event_at)
          : null,
    },
    circuitBreakersCount: Number(raw.circuitBreakersCount ?? raw.circuit_breakers_count ?? 0),
    humanReviewQueueCount: Number(raw.humanReviewQueueCount ?? raw.human_review_queue_count ?? 0),
    sovereigntyBroker: (raw.sovereigntyBroker ?? raw.sovereignty_broker ?? "unavailable") as ZTAIPStatus["sovereigntyBroker"],
    agentCertificatesCount: Number(raw.agentCertificatesCount ?? raw.agent_certificates_count ?? 0),
  };
}

export function useZtaipStatus() {
  return useQuery({
    queryKey: ztaipStatusQueryKey,
    queryFn: async () => {
      const raw = await ztaipApi.getStatus();
      return mapZtaipResponse(raw as Record<string, unknown>);
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useOrgProfile(_orgId: string | null) {
  return useQuery({
    queryKey: orgProfileQueryKey(_orgId ?? ""),
    queryFn: async () => ({ id: _orgId, name: "", jurisdiction: "", industry: null, region: null }),
    enabled: false,
  });
}

export function useAssessmentStream() {
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
    [queryClient]
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const clearStreamError = useCallback(() => setStreamError(null), []);

  return { events, isStreaming, streamError, clearStreamError, startStream, stopStream };
}
