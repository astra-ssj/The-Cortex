import { useState, useCallback, useEffect } from "react";

const API_BASE = "http://localhost:8000";

export const getToken = (): string | null =>
  localStorage.getItem("cortex_token");

export const getUser = () => {
  const u = localStorage.getItem("cortex_user");
  return u ? JSON.parse(u) : null;
};

export async function fetchApi<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function postApi<T>(path: string, body: unknown): Promise<T> {
  return fetchApi<T>(path, { method: "POST", body: JSON.stringify(body) });
}

async function patchApi<T>(path: string, body: unknown): Promise<T> {
  return fetchApi<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

// API modules
export const frameworksApi = {
  list: () => fetchApi("/api/v1/frameworks"),
};

export const organisationsApi = {
  getPosture: (orgId = "demo-org-001") =>
    fetchApi(`/api/v1/organisations/${orgId}/posture`),
};

export const assessmentsApi = {
  getReviewQueue: () =>
    fetchApi("/api/v1/assessments/review-queue"),
};

export const findingsApi = {
  list: () => fetchApi("/api/v1/findings"),
  update: (id: string, body: object) =>
    patchApi(`/api/v1/findings/${encodeURIComponent(id)}`, body),
};

export const reportsApi = {
  getExecutiveSummary: () =>
    fetchApi("/api/v1/reports/executive-summary"),
};

export const ztaipApi = {
  getStatus: () => fetchApi("/api/v1/system/ztaip-status"),
};

// SSE stream builder
export const buildStreamUrl = (): string => {
  const url = new URL(
    `${API_BASE}/api/v1/assessments/stream`
  );
  url.searchParams.set("org_id", "demo-org-001");
  url.searchParams.set(
    "frameworks",
    [
      "iso27001-2022",
      "gdpr-2016-679",
      "nis2-2022-2555",
      "nist-csf-2.0",
      "csa-ccm-v4",
      "cyber-essentials-v3.1",
      "eu-ai-act-2024",
      "eu-cybersecurity-act",
    ].join(",")
  );
  const token = getToken();
  if (token) url.searchParams.set("token", token);
  return url.toString();
};

// Compatibility for dashboard and App header
export const DEFAULT_ORG_ID = "demo-org-001";
export const ALL_FRAMEWORK_IDS =
  "iso27001-2022,gdpr-2016-679,nis2-2022-2555,nist-csf-2.0,csa-ccm-v4,cyber-essentials-v3.1,eu-ai-act-2024,eu-cybersecurity-act";

// ---- Audit Report (Executive Summary) — for components/AuditReport.tsx ----
export interface ExecutiveSummaryParams {
  org_id?: string;
  as_at?: string;
  entity_scope?: string;
}

export interface ExecutiveSummaryReport {
  as_at?: string;
  org_id?: string;
  org_name?: string;
  overall_posture: {
    group_compliance_score?: number;
    audit_readiness?: number;
    overall_risk_level?: string;
    frameworks_active?: number;
    total_controls_assessed?: number;
    critical_gaps?: number;
    findings_open?: number;
    findings_overdue?: number;
    [key: string]: unknown;
  };
  framework_summary: Array<{ framework_name: string; score: number | null; status: string; risk_level: string }>;
  top_critical_findings: Array<{
    title: string;
    framework: string;
    owner: string;
    due_date: string;
    days_open: number;
    [key: string]: unknown;
  }>;
  regulatory_exposure?: Record<string, string>;
  management_attention?: string[];
  recommendations?: string[];
  next_review?: string;
  [key: string]: unknown;
}

export async function fetchExecutiveSummary(
  params?: ExecutiveSummaryParams
): Promise<ExecutiveSummaryReport> {
  const search = new URLSearchParams();
  if (params?.org_id) search.set("org_id", params.org_id);
  if (params?.as_at) search.set("as_at", params.as_at);
  if (params?.entity_scope) search.set("entity_scope", params.entity_scope);
  const qs = search.toString();
  return fetchApi<ExecutiveSummaryReport>(
    `/api/v1/reports/executive-summary${qs ? `?${qs}` : ""}`
  );
}

// ---- Remediation / Findings (for RemediationTracker) ----
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
  [key: string]: unknown;
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

// ---- Human Review Queue (for HumanReview) ----
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
  [key: string]: unknown;
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
  [key: string]: unknown;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  reviewed: ReviewedItem[];
}

export async function fetchReviewQueueApi(): Promise<ReviewQueueResponse> {
  return fetchApi<ReviewQueueResponse>("/api/v1/assessments/review-queue");
}

export async function approveControl(
  id: string,
  notes: string
): Promise<{ status: string; control_id: string; audit_ref: string }> {
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
