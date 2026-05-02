import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { ALL_FRAMEWORK_IDS as ALL_FRAMEWORK_IDS_BUNDLE } from "../lib/frameworkRegistry";
import { clearCortexBrowserSession } from "../lib/cortexSession";

// In dev use relative URLs so Vite proxy (→ localhost:8000) is used; avoids CORS and connection to wrong host.
const API_BASE = import.meta.env.DEV ? "" : "http://localhost:8000";

function getApiOrigin(): string {
  if (API_BASE) return API_BASE;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:8000";
}

/** Default demo tenant — prefer ``useOrgContext().orgId`` for API calls after login. */
export const DEFAULT_ORG_ID = "demo-org-001";
/** Re-export bundle string from ``frameworkRegistry`` (single source for ids + labels). */
export const ALL_FRAMEWORK_IDS = ALL_FRAMEWORK_IDS_BUNDLE;

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
  const url = `${API_BASE || ""}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearCortexBrowserSession();
      window.dispatchEvent(new CustomEvent("cortex:auth-expired"));
    }
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

async function putApi<T>(path: string, body: unknown): Promise<T> {
  return fetchApi<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

// API modules
export const frameworksApi = {
  list: () => fetchApi("/api/v1/frameworks"),
};

export const organisationsApi = {
  getPosture: (orgId: string = DEFAULT_ORG_ID) =>
    fetchApi(`/api/v1/organisations/${encodeURIComponent(orgId)}/posture`),
};

export const assessmentsApi = {
  getReviewQueue: () =>
    fetchApi("/api/v1/assessments/review-queue"),
  /** Acknowledges run; open SSE via buildStreamUrl + ``fetchEventSource`` (Bearer header). */
  run: (body: { org_id: string; frameworks: string[] }) =>
    postApi<{ status: string; org_id: string; framework_ids: string[] }>(
      "/api/v1/assessments/run",
      body
    ),
};

export const findingsApi = {
  list: () => fetchApi("/api/v1/findings"),
  update: (id: string, body: object) =>
    patchApi(`/api/v1/findings/${encodeURIComponent(id)}`, body),
};

/** Transilience Shasta cloud CSPM — Postgres-backed via API (not Shasta SQLite). */
export interface ShastaScanRunRow {
  id: string;
  org_id: string;
  cloud: string;
  engine_scan_id: string | null;
  findings_count: number;
  status: string;
  created_by: string | null;
  started_at: string;
  completed_at: string | null;
  error_message?: string | null;
}

export interface ShastaCloudFindingRow {
  id: number;
  scan_run_id: string;
  org_id: string;
  finding_key: string;
  title: string | null;
  severity_normalized: string | null;
  cloud_provider: string | null;
  region: string | null;
  check_id: string | null;
  resource_id: string | null;
  created_at: string;
}

/** GET /shasta/scans/{id}/evidence-map — finding ↔ framework-control graph. */
export interface ShastaEvidenceMapSummary {
  findings: number;
  control_nodes: number;
  edges: number;
}

export interface ShastaEvidenceMapOut {
  source: "shasta";
  scan_run_id: string;
  org_id: string;
  scan_status: string;
  cloud: string | null;
  summary: ShastaEvidenceMapSummary;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

/** GET …/evidence-links — append-only rows derived from ``framework_controls``. */
export interface ShastaEvidenceLinkRow {
  id: number;
  scan_run_id: string;
  org_id: string;
  finding_id: number;
  framework_family: string;
  control_ref: string;
  source_engine: string;
  created_at: string;
}

export const shastaCloudApi = {
  contract: () => fetchApi<Record<string, unknown>>("/api/v1/shasta/contract"),
  runScan: (body: { cloud: "aws" | "azure"; org_id: string }) =>
    postApi<{
      scan_run_id: string;
      status: "running";
      org_id: string;
      delivery?: "redis" | "in_process";
    }>("/api/v1/shasta/scans", body),
  getScan: (orgId: string, scanRunId: string) =>
    fetchApi<ShastaScanRunRow>(
      `/api/v1/shasta/scans/${encodeURIComponent(scanRunId)}?org_id=${encodeURIComponent(orgId)}`
    ),
  listScans: (orgId: string) =>
    fetchApi<ShastaScanRunRow[]>(
      `/api/v1/shasta/scans?org_id=${encodeURIComponent(orgId)}`
    ),
  listRecentFindings: (orgId: string, severity?: string) => {
    const q = new URLSearchParams({ org_id: orgId });
    if (severity?.trim()) q.set("severity", severity.trim());
    return fetchApi<ShastaCloudFindingRow[]>(`/api/v1/shasta/findings?${q.toString()}`);
  },
  listFindingsForScan: (orgId: string, scanRunId: string, limit = 500) => {
    const q = new URLSearchParams({
      org_id: orgId,
      limit: String(limit),
    });
    return fetchApi<ShastaCloudFindingRow[]>(
      `/api/v1/shasta/scans/${encodeURIComponent(scanRunId)}/findings?${q.toString()}`
    );
  },
  getEvidenceMap: (orgId: string, scanRunId: string) => {
    const q = new URLSearchParams({ org_id: orgId });
    return fetchApi<ShastaEvidenceMapOut>(
      `/api/v1/shasta/scans/${encodeURIComponent(scanRunId)}/evidence-map?${q.toString()}`
    );
  },
  getEvidenceLinks: (orgId: string, scanRunId: string, limit = 5000) => {
    const q = new URLSearchParams({ org_id: orgId, limit: String(limit) });
    return fetchApi<ShastaEvidenceLinkRow[]>(
      `/api/v1/shasta/scans/${encodeURIComponent(scanRunId)}/evidence-links?${q.toString()}`
    );
  },
};

export const reportsApi = {
  getExecutiveSummary: () =>
    fetchApi("/api/v1/reports/executive-summary"),
};

export const groupsApi = {
  getPosture: (orgId?: string) => {
    const qs =
      orgId != null && orgId !== ""
        ? `?org_id=${encodeURIComponent(orgId)}`
        : "";
    return fetchApi<GroupPostureResponse>(`/api/v1/groups/posture${qs}`);
  },
};

export const ztaipApi = {
  getStatus: () => fetchApi("/api/v1/system/ztaip-status"),
};

export const integrationsApi = {
  list: () => fetchApi<IntegrationSummary[]>("/api/v1/integrations"),
  get: (id: string) => fetchApi<IntegrationDetail>(`/api/v1/integrations/${encodeURIComponent(id)}`),
  test: (id: string) => fetchApi<{ status: string; message?: string }>(`/api/v1/integrations/${encodeURIComponent(id)}/test`, { method: "POST" }),
};

export interface IntegrationSetupStep {
  step: number;
  title: string;
  description: string;
  docs_url: string | null;
}

export interface IntegrationCredentialField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  multiline?: boolean;
}

export interface IntegrationSummary {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  status: "not_connected" | "connected" | "coming_soon";
  description: string;
  compliance_value: string[];
  data_collected: string[];
  setup_steps: IntegrationSetupStep[];
  credentials_required: IntegrationCredentialField[];
}
export type IntegrationDetail = IntegrationSummary;

// ---- Group posture (multi-entity dashboard) ----
export interface GroupFrameworkEntry {
  id: string;
  name: string;
  score: number;
  status: string;
  risk: string;
}

export interface GroupEntity {
  id: string;
  name: string;
  jurisdiction: string;
  flag: string;
  type: "ESSENTIAL" | "IMPORTANT" | "STANDARD";
  employees: number;
  role: string;
  overall_score: number;
  risk_level: string;
  status: string;
  frameworks: GroupFrameworkEntry[];
  critical_findings: number;
  open_findings: number;
  last_assessed: string;
}

export interface GroupPostureResponse {
  group_name: string;
  as_at: string;
  overall_score: number;
  overall_risk: string;
  entities_count: number;
  frameworks_active: number;
  critical_findings: number;
  entities: GroupEntity[];
}

// SSE stream builder
const DEFAULT_STREAM_FRAMEWORKS = [
  "iso27001-2022",
  "gdpr-2016-679",
  "nis2-2022-2555",
  "nist-csf-2.0",
  "csa-ccm-v4",
  "cyber-essentials-v3.1",
  "eu-ai-act-2024",
  "eu-cybersecurity-act",
] as const;

/** SSE URL for assessment stream — no JWT in query (use ``Authorization`` via ``fetchEventSource``). */
export function buildStreamUrl(
  orgId: string = DEFAULT_ORG_ID,
  frameworkIds: readonly string[] | string = DEFAULT_STREAM_FRAMEWORKS
): string {
  const url = new URL(`${getApiOrigin()}/api/v1/assessments/stream`);
  url.searchParams.set("org_id", orgId);
  const fw =
    typeof frameworkIds === "string"
      ? frameworkIds
      : frameworkIds.join(",");
  url.searchParams.set("frameworks", fw);
  return url.toString();
}

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
  regulatory_exposure?:
    | Record<string, string>
    | Array<{
        regulation?: string;
        max_fine?: string;
        likely_fine?: string;
        basis?: string;
        status?: string;
      }>;
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
  org_id?: string;
}

export async function fetchFindings(params?: ListFindingsParams): Promise<RemediationFinding[]> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.severity) search.set("severity", params.severity);
  if (params?.framework_id) search.set("framework_id", params.framework_id);
  if (params?.entity) search.set("entity", params.entity);
  if (params?.org_id) search.set("org_id", params.org_id);
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

export async function fetchReviewQueueApi(orgId?: string): Promise<ReviewQueueResponse> {
  const qs =
    orgId != null && orgId !== ""
      ? `?org_id=${encodeURIComponent(orgId)}`
      : "";
  return fetchApi<ReviewQueueResponse>(`/api/v1/assessments/review-queue${qs}`);
}

export async function putOnboardingStep(body: {
  step: number;
  data?: Record<string, unknown>;
}): Promise<{ step: number; org_id: string; updated: Record<string, unknown> }> {
  return putApi("/api/v1/auth/onboarding/step", body);
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

export const reviewQueueQueryKey = (orgId: string) => ["reviewQueue", orgId] as const;

export function useReviewQueue(orgId?: string | null): {
  items: ReviewQueueItem[] | null;
  reviewed: ReviewedItem[] | null;
  refetch: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
} {
  const oid = orgId ?? "";
  const q = useQuery({
    queryKey: reviewQueueQueryKey(oid),
    queryFn: () => fetchReviewQueueApi(orgId ?? undefined),
  });

  const refetch = useCallback(async () => {
    await q.refetch();
  }, [q]);

  return {
    items: q.data?.items ?? null,
    reviewed: q.data?.reviewed ?? null,
    refetch,
    isLoading: q.isPending,
    error:
      q.error instanceof Error
        ? q.error
        : q.error != null
          ? new Error(String(q.error))
          : null,
  };
}
