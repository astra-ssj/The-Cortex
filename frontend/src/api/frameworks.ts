/**
 * Frameworks API client and TanStack Query hooks.
 * Types match backend api/schemas.py response models.
 * Uses auth token for protected /api/v1/frameworks.
 */
import { getToken } from "../auth";

export interface FrameworkSummary {
  id: string;
  name: string;
  version: string;
  jurisdiction: string;
  purpose_tags: string[];
  control_count: number;
}

export interface EvidenceTypeOut {
  id: string;
  name: string;
  description: string;
}

export interface RequirementOut {
  id: string;
  article_ref: string;
  description: string;
  evidence_types: EvidenceTypeOut[];
}

export interface ControlOut {
  id: string;
  name: string;
  domain: string;
  requirements: RequirementOut[];
}

export interface FrameworkDetail {
  id: string;
  name: string;
  version: string;
  jurisdiction: string;
  purpose_tags: string[];
  controls: ControlOut[];
}

export interface PaginatedControls {
  items: ControlOut[];
  total: number;
  page: number;
  page_size: number;
}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) || "";

async function fetchApi<T>(path: string): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchFrameworks(): Promise<FrameworkSummary[]> {
  return fetchApi<FrameworkSummary[]>("/api/v1/frameworks");
}

export async function fetchFramework(id: string): Promise<FrameworkDetail> {
  return fetchApi<FrameworkDetail>(`/api/v1/frameworks/${encodeURIComponent(id)}`);
}

export async function fetchFrameworkControls(
  id: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedControls> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  return fetchApi<PaginatedControls>(
    `/api/v1/frameworks/${encodeURIComponent(id)}/controls?${params}`
  );
}
