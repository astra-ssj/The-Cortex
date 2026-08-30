/**
 * Compliance data: TanStack Query hooks, query keys, and cache invalidation.
 * The assessment SSE stream lives in ./assessmentStream, which shares one
 * connection across the app rather than one per calling component.
 */

import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { CompliancePosture } from "../types/compliance";
import { organisationsApi, reviewQueueQueryKey } from "../api/client";

// Query keys
export const postureQueryKey = (orgId: string) => ["posture", orgId] as const;
export const orgProfileQueryKey = (orgId: string) => ["orgProfile", orgId] as const;

/** Refresh posture and review queue after SSE assessment runs or related mutations. */
export function invalidateComplianceData(queryClient: QueryClient, orgId: string | null | undefined): void {
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

export function useOrgProfile(_orgId: string | null) {
  return useQuery({
    queryKey: orgProfileQueryKey(_orgId ?? ""),
    queryFn: async () => ({ id: _orgId, name: "", jurisdiction: "", industry: null, region: null }),
    enabled: false,
  });
}

