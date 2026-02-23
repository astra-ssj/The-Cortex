const API_BASE = "http://localhost:8000";

export async function fetchApi(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("cortex_token");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || `HTTP ${response.status}`
    );
  }
  return response.json();
}

export const frameworksApi = {
  list: () => fetchApi("/api/v1/frameworks"),
};

export const organisationsApi = {
  getPosture: (orgId: string) =>
    fetchApi(`/api/v1/organisations/${orgId}/posture`),
};

export const assessmentsApi = {
  getReviewQueue: () =>
    fetchApi("/api/v1/assessments/review-queue"),
};

export const findingsApi = {
  list: () => fetchApi("/api/v1/findings"),
};

export const reportsApi = {
  getExecutiveSummary: () =>
    fetchApi("/api/v1/reports/executive-summary"),
};

// ---- Compatibility: used by App, ComplianceDashboard, complianceStore ----

import type { CompliancePosture, ZTAIPStatus, AssessmentEvent } from "../types/compliance";

export const DEFAULT_ORG_ID = "demo-org-001";
export const ALL_FRAMEWORK_IDS =
  "iso27001-2022,gdpr-2016-679,nis2-2022-2555,nist-csf-2.0,csa-ccm-v4,cyber-essentials-v3.1,eu-ai-act-2024,eu-cybersecurity-act";

export type { CompliancePosture, ZTAIPStatus, AssessmentEvent } from "../types/compliance";

export interface OrgProfile {
  id: string;
  name: string;
  jurisdiction: string;
  industry: string | null;
  region: string | null;
}

export async function fetchPosture(orgId: string): Promise<CompliancePosture> {
  return organisationsApi.getPosture(orgId) as Promise<CompliancePosture>;
}

export async function fetchOrgProfile(orgId: string): Promise<OrgProfile> {
  return fetchApi(`/api/v1/organisations/${encodeURIComponent(orgId)}`);
}

export async function fetchZtaipStatus(): Promise<ZTAIPStatus> {
  return fetchApi("/api/v1/system/ztaip-status");
}

export function createAssessmentStream(
  organizationId: string,
  frameworkIds: string[],
  onEvent: (event: AssessmentEvent) => void,
  onError?: (err: Event) => void
): EventSource {
  const frameworks =
    frameworkIds.length > 0
      ? frameworkIds.join(",")
      : ALL_FRAMEWORK_IDS;
  const url = new URL(`${API_BASE}/api/v1/assessments/stream`);
  url.searchParams.set("org_id", organizationId);
  url.searchParams.set("frameworks", frameworks);
  const token = localStorage.getItem("cortex_token");
  if (token) url.searchParams.set("token", token);
  const es = new EventSource(url.toString());
  const handler = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as AssessmentEvent;
      if (data && typeof data === "object" && "kind" in data) onEvent(data);
    } catch {
      // ignore parse errors
    }
  };
  ["run_start", "framework_start", "control_context", "control_result", "framework_done", "run_done", "error"].forEach(
    (kind) => es.addEventListener(kind, handler)
  );
  es.onmessage = handler;
  if (onError) es.onerror = onError;
  return es;
}
