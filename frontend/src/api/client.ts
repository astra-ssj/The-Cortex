import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { ALL_FRAMEWORK_IDS as ALL_FRAMEWORK_IDS_BUNDLE } from "../lib/frameworkRegistry";
import { clearCortexBrowserSession } from "../lib/cortexSession";

// In dev use relative URLs so Vite proxy (→ localhost:8000) is used; avoids CORS and connection to wrong host.
const API_BASE = import.meta.env.DEV ? "" : "http://localhost:8000";

/** Abort hung fetches (proxy waiting on dead API). Set VITE_FETCH_TIMEOUT_MS=0 to disable. */
const FETCH_TIMEOUT_MS = Number(import.meta.env.VITE_FETCH_TIMEOUT_MS ?? 45000);

function withFetchTimeout(init: RequestInit): {
  init: RequestInit;
  clearTimer: () => void;
  timedOutRef: { current: boolean };
} {
  const timedOutRef = { current: false };
  if (FETCH_TIMEOUT_MS <= 0) {
    return { init, clearTimer: () => {}, timedOutRef };
  }
  const ctrl = new AbortController();
  const tid = setTimeout(() => {
    timedOutRef.current = true;
    ctrl.abort();
  }, FETCH_TIMEOUT_MS);
  const userSig = init.signal;
  if (userSig) {
    if (userSig.aborted) {
      clearTimeout(tid);
      ctrl.abort();
      return { init: { ...init, signal: ctrl.signal }, clearTimer: () => {}, timedOutRef };
    }
    userSig.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  return {
    init: { ...init, signal: ctrl.signal },
    clearTimer: () => clearTimeout(tid),
    timedOutRef,
  };
}

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

/** Serialized refresh token for DB-backed sessions (see POST /api/v1/auth/refresh). */
export const getRefreshToken = (): string | null =>
  localStorage.getItem("cortex_refresh_token");

let _refreshSingleFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const rt = localStorage.getItem("cortex_refresh_token");
  if (!rt) return false;
  if (_refreshSingleFlight) return _refreshSingleFlight;

  _refreshSingleFlight = (async (): Promise<boolean> => {
    try {
      const url = `${API_BASE || ""}/api/v1/auth/refresh`;
      const refreshInit: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      };
      const { init: timed, clearTimer, timedOutRef } = withFetchTimeout(refreshInit);
      let res: Response;
      try {
        res = await fetch(url, { ...refreshInit, ...timed });
      } catch {
        if (timedOutRef.current) return false;
        return false;
      } finally {
        clearTimer();
      }
      if (!res.ok) return false;
      const data = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
      };
      if (!data.access_token || !data.refresh_token) return false;
      localStorage.setItem("cortex_token", data.access_token);
      localStorage.setItem("cortex_refresh_token", data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      _refreshSingleFlight = null;
    }
  })();

  return _refreshSingleFlight;
}

export const getUser = (): Record<string, unknown> | null => {
  const u = localStorage.getItem("cortex_user");
  return u ? JSON.parse(u) : null;
};

export async function fetchApi<T = unknown>(
  path: string,
  options: RequestInit = {},
  retriedAfterRefresh = false
): Promise<T> {
  const token = getToken();
  const url = `${API_BASE || ""}${path}`;
  const { init: timedInit, clearTimer, timedOutRef } = withFetchTimeout(options);
  let res: Response;
  try {
    try {
      res = await fetch(url, {
        ...options,
        ...timedInit,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
    } catch (e) {
      if (timedOutRef.current) {
        throw new Error(
          `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s — is the API running (e.g. port 8000)?`
        );
      }
      throw e;
    }

  if (
    res.status === 401 &&
    !retriedAfterRefresh &&
    localStorage.getItem("cortex_refresh_token")
  ) {
    const ok = await refreshAccessToken();
    if (ok) return fetchApi<T>(path, options, true);
  }

  if (!res.ok) {
    if (res.status === 401) {
      clearCortexBrowserSession();
      window.dispatchEvent(new CustomEvent("cortex:auth-expired"));
    }
    const err = await res.json().catch(() => ({}));
    const body = err as { error?: { message?: string }; detail?: unknown };
    const fromEnvelope = body.error?.message;
    const fromLegacy =
      typeof body.detail === "string"
        ? body.detail
        : Array.isArray(body.detail)
          ? JSON.stringify(body.detail)
          : undefined;
    throw new Error(fromEnvelope || fromLegacy || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
  } finally {
    clearTimer();
  }
}

/** Matches compliance-engine ``document_id`` (SHA-256 of first 1 KiB, hex prefix). */
export async function computeIngestDocumentId(file: File): Promise<string> {
  const n = Math.min(1024, file.size);
  const buf = await file.slice(0, n).arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `doc-${hex.slice(0, 12)}`;
}

function sseProgressFromEvent(event: string, dataLine: string): number | null {
  if (event === "mapping_done") return 72;
  if (event === "evidence_created") return 86;
  if (event === "persisted") return 92;
  if (event === "summary") return 94;
  if (event === "done") return 100;
  if (event !== "progress") return null;
  try {
    const d = JSON.parse(dataLine) as { stage?: string };
    const s = d.stage;
    if (s === "processing") return 18;
    if (s === "chunks") return 38;
    if (s === "mapping") return 56;
    if (s === "done") return 92;
  } catch {
    return null;
  }
  return null;
}

export interface IngestSseResult {
  evidenceId?: string;
  controlsLinked?: number;
  findingLinked?: boolean;
}

/** Consume ingest SSE stream; throws on ``event: error``; optional rough progress from pipeline events. */
async function consumeIngestSseBody(
  body: ReadableStream<Uint8Array> | null,
  onProgress?: (pct: number) => void
): Promise<IngestSseResult> {
  const result: IngestSseResult = {};
  if (!body) return result;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let ev = "";
      let data = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trimStart();
      }

      const dataTrim = data.trim();
      const pct = sseProgressFromEvent(ev, dataTrim);
      if (pct != null) onProgress?.(pct);
      if (ev === "persisted" || ev === "summary") {
        try {
          const j = JSON.parse(dataTrim) as {
            evidence_id?: string;
            controls_linked?: number;
            finding_linked?: boolean;
          };
          if (j.evidence_id) result.evidenceId = j.evidence_id;
          if (typeof j.controls_linked === "number") result.controlsLinked = j.controls_linked;
          if (typeof j.finding_linked === "boolean") result.findingLinked = j.finding_linked;
        } catch {
          /* ignore */
        }
      }
      if (ev === "error") {
        let msg = "Document ingest failed";
        try {
          const j = JSON.parse(dataTrim) as { message?: string };
          if (j.message) msg = j.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
    }
  }
  return result;
}

export interface UploadEvidenceOptions {
  onProgress?: (pct: number) => void;
}

/**
 * POST /api/v1/ingest/document — multipart file upload; response is SSE (not JSON).
 * Forwards finding/control/framework metadata for graph linking and remediation attachment.
 */
export async function uploadEvidence(
  file: File,
  metadata: {
    org_id: string;
    finding_id?: string;
    control_id?: string;
    framework_id?: string;
    description?: string;
  },
  options?: UploadEvidenceOptions
): Promise<{ id: string; filename: string; evidenceId?: string; controlsLinked?: number }> {
  const formData = new FormData();
  formData.append("file", file);
  Object.entries(metadata).forEach(([k, v]) => {
    if (v != null && v !== "") formData.append(k, v);
  });

  const token = getToken();
  const url = `${API_BASE || ""}/api/v1/ingest/document`;
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const id = await computeIngestDocumentId(file);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearCortexBrowserSession();
      window.dispatchEvent(new CustomEvent("cortex:auth-expired"));
    }
    const errText = await res.text().catch(() => "");
    throw new Error(errText.trim() || `HTTP ${res.status}`);
  }

  options?.onProgress?.(8);
  const ingestMeta = await consumeIngestSseBody(res.body, options?.onProgress);
  options?.onProgress?.(100);

  return {
    id,
    filename: file.name,
    evidenceId: ingestMeta.evidenceId,
    controlsLinked: ingestMeta.controlsLinked,
  };
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
/** Standard list pagination envelope (matches api/schemas.py). */
export interface PaginatedJsonRows<T = Record<string, unknown>> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export const organisationsApi = {
  getPosture: (orgId: string = DEFAULT_ORG_ID) =>
    fetchApi(`/api/v1/organisations/${encodeURIComponent(orgId)}/posture`),
};

export const assessmentsApi = {
  /** Acknowledges run; open SSE via buildStreamUrl + ``fetchEventSource`` (Bearer header). */
  run: (body: { org_id: string; frameworks: string[] }) =>
    postApi<{ status: string; org_id: string; framework_ids: string[] }>(
      "/api/v1/assessments/run",
      body
    ),
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

export type LlmPlatformStatusResponse = {
  chain: string[];
  active_chain: string[];
  providers: Record<
    string,
    { provider?: string; configured?: boolean; model?: string; api_key_set?: boolean }
  >;
  assessment_llm_enabled?: boolean;
  assessment_max_controls_per_run?: number;
};

export const systemApi = {
  getLlmProviders: () =>
    fetchApi<LlmPlatformStatusResponse>("/api/v1/system/llm-providers"),
};

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

function executiveSummarySearchParams(params?: ExecutiveSummaryParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params?.org_id) search.set("org_id", params.org_id);
  if (params?.as_at) search.set("as_at", params.as_at);
  if (params?.entity_scope) search.set("entity_scope", params.entity_scope);
  search.set("format", "pdf");
  return search;
}

/** Download server-generated executive summary PDF (auditor pack). */
export async function downloadExecutiveSummaryPdf(
  params?: ExecutiveSummaryParams
): Promise<void> {
  const search = executiveSummarySearchParams(params);
  const token = getToken();
  const url = `${API_BASE || ""}/api/v1/reports/executive-summary/export?${search.toString()}`;
  const headers: HeadersInit = { Accept: "application/pdf" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    if (res.status === 401) {
      clearCortexBrowserSession();
      window.dispatchEvent(new CustomEvent("cortex:auth-expired"));
    }
    const errText = await res.text().catch(() => "");
    throw new Error(errText.trim() || `PDF export failed (HTTP ${res.status})`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^";\n]+)"?/i.exec(disposition);
  const filename = match?.[1]?.trim() || `Executive-Summary-${params?.as_at || "report"}.pdf`;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
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

export async function fetchFindings(
  params?: ListFindingsParams & { offset?: number; limit?: number }
): Promise<PaginatedJsonRows<RemediationFinding>> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.severity) search.set("severity", params.severity);
  if (params?.framework_id) search.set("framework_id", params.framework_id);
  if (params?.entity) search.set("entity", params.entity);
  if (params?.org_id) search.set("org_id", params.org_id);
  if (params?.offset != null) search.set("offset", String(params.offset));
  if (params?.limit != null) search.set("limit", String(params.limit));
  const qs = search.toString();
  const raw = await fetchApi<PaginatedJsonRows<RemediationFinding> | RemediationFinding[]>(
    `/api/v1/findings${qs ? `?${qs}` : ""}`
  );
  if (raw == null || typeof raw !== "object") {
    return { items: [], total: 0, offset: 0, limit: 0 };
  }
  if (Array.isArray(raw)) {
    const items = raw;
    return { items, total: items.length, offset: 0, limit: items.length };
  }
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    items,
    total: typeof raw.total === "number" ? raw.total : items.length,
    offset: typeof raw.offset === "number" ? raw.offset : 0,
    limit: typeof raw.limit === "number" ? raw.limit : items.length,
  };
}

/** GET /api/v1/findings/{id} — single finding for detail view / deep links. */
export async function getFinding(
  id: string,
  params?: Pick<ListFindingsParams, "org_id">
): Promise<RemediationFinding> {
  const search = new URLSearchParams();
  if (params?.org_id) search.set("org_id", params.org_id);
  const qs = search.toString();
  return fetchApi<RemediationFinding>(
    `/api/v1/findings/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`
  );
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
  totalPending: number;
  totalReviewed: number;
  limit: number;
  offset: number;
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

/** Learning Loop v1 — org-scoped scenario session. */
export interface LearningSession {
  id: string;
  org_id: string;
  scenario: string;
  learner_id: string;
  state: Record<string, unknown>;
  stage: string;
  risk: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  jurisdiction?: string;
  purpose_tags?: string[];
}

export function createLearningSession(body?: {
  org_id?: string;
  scenario?: string;
}): Promise<LearningSession> {
  return postApi<LearningSession>("/api/v1/learning/sessions", body ?? {});
}

export function getLearningSession(
  sessionId: string,
  orgId?: string
): Promise<LearningSession> {
  const qs = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
  return fetchApi<LearningSession>(
    `/api/v1/learning/sessions/${encodeURIComponent(sessionId)}${qs}`
  );
}

export function decideLearningSession(
  sessionId: string,
  choice: string,
  orgId?: string
): Promise<LearningSession> {
  const qs = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
  return postApi<LearningSession>(
    `/api/v1/learning/sessions/${encodeURIComponent(sessionId)}/decide${qs}`,
    { choice }
  );
}

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
