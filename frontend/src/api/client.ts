/**
 * Central API client. All endpoints the frontend calls.
 * Types match backend and frontend/src/types/compliance.ts.
 * VITE_API_URL: set to http://localhost:8000 for production build or when not using Vite dev proxy.
 */
const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? "" : "http://localhost:8000");

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

// SSE must hit the API directly; dev proxy can buffer and block streaming.
const STREAM_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? "http://localhost:8000" : API_BASE);

/** Comma-separated list of all 8 framework IDs for assessment stream. */
export const ALL_FRAMEWORK_IDS =
  "iso27001-2022,gdpr-2016-679,nis2-2022-2555,nist-csf-2.0,csa-ccm-v4,cyber-essentials-v3.1,eu-ai-act-2024,eu-cybersecurity-act";

/** Default org_id for assessment stream. */
export const DEFAULT_ORG_ID = "demo-org-001";

export function createAssessmentStream(
  organizationId: string,
  frameworkIds: string[],
  onEvent: (event: AssessmentEvent) => void,
  onError?: (err: Event) => void
): EventSource {
  const frameworks = frameworkIds.length ? frameworkIds.join(",") : ALL_FRAMEWORK_IDS;
  // Use /assessments/run (organization_id, framework_ids) for compatibility with deployed API
  const url = new URL(`${STREAM_BASE}/api/v1/assessments/run`);
  url.searchParams.set("organization_id", organizationId);
  url.searchParams.set("framework_ids", frameworks);
  const es = new EventSource(url.toString());
  const handler = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as AssessmentEvent;
      console.log("Event received:", data);
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
