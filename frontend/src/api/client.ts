/**
 * Central API client. All endpoints the frontend calls.
 * Types match backend and frontend/src/types/compliance.ts.
 * VITE_API_URL: set to http://localhost:8000 for production build or when not using Vite dev proxy.
 */
import { useState, useEffect, useCallback } from "react";

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

async function postApi<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function patchApi<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

// ---- Human Review Queue (GDPR Art.22 / EU AI Act Art.14) ----

export interface ReviewQueueItem {
  id: string;
  framework: string;
  controlId: string;
  name: string;
  assessment: string;
  confidence: number;
  severity: string;
  reference: string;
  dateFlagged: string;
}

export interface ReviewedItem {
  id: string;
  framework: string;
  controlId: string;
  action: string;
  actedBy: string;
  actedAt: string;
  originalConfidence: number;
  finalDecision: string;
  auditRef?: string;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  reviewed: ReviewedItem[];
}

export async function fetchReviewQueueApi(): Promise<ReviewQueueResponse> {
  return fetchApi<ReviewQueueResponse>("/api/v1/assessments/review-queue");
}

// ---- Remediation Tracker (Findings) ----

export type FindingStatus = "OPEN" | "IN_PROGRESS" | "REMEDIATED" | "ACCEPTED";
export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface RemediationFinding {
  id: string;
  title: string;
  severity: FindingSeverity;
  framework: string;
  framework_id: string;
  control_id: string;
  control_name: string;
  reference: string;
  entity: string;
  entity_code: string;
  status: FindingStatus;
  current_state: string;
  required_state: string;
  actions: string[];
  completed_actions: number[];
  owner: string;
  due_date: string;
  days_open: number;
  priority: "P0" | "P1" | "P2";
  notes: { text: string; timestamp: string }[];
}

export interface ListFindingsParams {
  status?: string;
  severity?: string;
  framework_id?: string;
  entity?: string;
}

export async function fetchFindings(params?: ListFindingsParams): Promise<RemediationFinding[]> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.severity) search.set("severity", params.severity);
  if (params?.framework_id) search.set("framework_id", params.framework_id);
  if (params?.entity) search.set("entity", params.entity);
  const qs = search.toString();
  return fetchApi<RemediationFinding[]>(`/api/v1/findings${qs ? `?${qs}` : ""}`);
}

export interface UpdateFindingBody {
  status?: FindingStatus;
  owner?: string;
  due_date?: string;
  notes?: { text: string; timestamp: string }[];
  note_append?: string;
  note_timestamp?: string;
  completed_actions?: number[];
  priority?: "P0" | "P1" | "P2";
}

export async function updateFinding(id: string, body: UpdateFindingBody): Promise<RemediationFinding> {
  return patchApi<RemediationFinding>(`/api/v1/findings/${encodeURIComponent(id)}`, body);
}

export async function approveControl(id: string, notes: string): Promise<{ status: string; control_id: string; audit_ref: string }> {
  return postApi(`/api/v1/assessments/controls/${encodeURIComponent(id)}/approve`, { notes });
}

export async function overrideControl(
  id: string,
  assessment: "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT",
  justification: string
): Promise<{ status: string; control_id: string; audit_ref: string }> {
  return postApi(`/api/v1/assessments/controls/${encodeURIComponent(id)}/override`, {
    assessment,
    justification,
  });
}

export function useReviewQueue(): {
  items: ReviewQueueItem[] | null;
  reviewed: ReviewedItem[] | null;
  refetch: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
} {
  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchReviewQueueApi();
      setItems(data.items);
      setReviewed(data.reviewed);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { items, reviewed, refetch, isLoading, error };
}
