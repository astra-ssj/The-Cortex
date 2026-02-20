/**
 * Central API client. All endpoints the frontend calls.
 * Types match backend and frontend/src/types/compliance.ts.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || "";

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// Re-export frameworks API (or keep frameworks.ts and use it from store).
export {
  fetchFrameworks,
  fetchFramework,
  fetchFrameworkControls,
} from "./frameworks";
export type { FrameworkSummary, FrameworkDetail, PaginatedControls } from "./frameworks";

// ---- Organisations ----

export interface OrgProfile {
  id: string;
  name: string;
  jurisdiction: string;
  industry: string | null;
  region: string | null;
}

export async function fetchOrgProfile(orgId: string): Promise<OrgProfile> {
  return fetchApi<OrgProfile>(`/api/v1/organisations/${encodeURIComponent(orgId)}`);
}

import type { CompliancePosture } from "../types/compliance";

export type { CompliancePosture } from "../types/compliance";

export async function fetchPosture(orgId: string): Promise<CompliancePosture> {
  return fetchApi<CompliancePosture>(`/api/v1/organisations/${encodeURIComponent(orgId)}/posture`);
}

// ---- ZTAIP status ----

import type { ZTAIPStatus } from "../types/compliance";

export type { ZTAIPStatus } from "../types/compliance";

export async function fetchZtaipStatus(): Promise<ZTAIPStatus> {
  return fetchApi<ZTAIPStatus>("/api/v1/system/ztaip-status");
}

// ---- Assessment stream (SSE) ----

import type { AssessmentEvent } from "../types/compliance";

export function createAssessmentStream(
  organizationId: string,
  frameworkIds: string[],
  onEvent: (event: AssessmentEvent) => void,
  onError?: (err: Event) => void
): EventSource {
  const params = new URLSearchParams({
    organization_id: organizationId,
    framework_ids: frameworkIds.join(","),
  });
  const url = `${API_BASE}/api/v1/assessments/run?${params}`;
  const es = new EventSource(url);
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
  es.onmessage = handler; // fallback if event type not set
  if (onError) es.onerror = onError;
  return es;
}
