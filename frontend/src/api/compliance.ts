/**
 * Compliance Overview API — org posture derived from completed training.
 *
 * Distinct from `store/complianceStore.ts`, which serves the LLM assessment
 * posture. These are two different claims: one is what an assessment run found,
 * this is what the team has demonstrated it can actually do.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "./client";

export type ControlStatus = "strong" | "developing" | "gap";

export interface OverviewControl {
  ref: string;
  name: string;
  competency: number;
  status: ControlStatus;
  dimensions: string[];
  /** Scenario that exercises this control, for the practise link. */
  scenario_slug: string | null;
}

export interface UnassessedControl {
  ref: string;
  name: string;
}

export interface OverviewSummary {
  controls_assessed: number;
  /** Controls the active scenario content can exercise — not all 93 Annex A. */
  controls_available: number;
  average_competency: number;
  open_gaps: number;
}

export interface ComplianceOverview {
  org_id: string;
  org_label: string;
  framework: string;
  framework_name: string;
  summary: OverviewSummary;
  controls: OverviewControl[];
  not_assessed: UnassessedControl[];
}

export const DEFAULT_FRAMEWORK = "iso27001-2022";

export const complianceOverviewQueryKey = (orgId: string, framework: string) =>
  ["compliance-overview", orgId, framework] as const;

export function getComplianceOverview(
  orgId: string | null,
  framework: string = DEFAULT_FRAMEWORK,
): Promise<ComplianceOverview> {
  const params = new URLSearchParams({ framework });
  if (orgId) params.set("org_id", orgId);
  return fetchApi<ComplianceOverview>(`/api/v1/compliance/overview?${params.toString()}`);
}

export function useComplianceOverview(
  orgId: string | null,
  framework: string = DEFAULT_FRAMEWORK,
) {
  return useQuery({
    queryKey: complianceOverviewQueryKey(orgId ?? "", framework),
    queryFn: () => getComplianceOverview(orgId, framework),
    enabled: Boolean(orgId),
    // Posture only moves when a session completes, so refetch on focus rather
    // than on a timer — the learner returning from a debrief is the trigger.
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}
