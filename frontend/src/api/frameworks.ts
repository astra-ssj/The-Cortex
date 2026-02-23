/**
 * Frameworks API client and TanStack Query hooks.
 * Types match backend api/schemas.py response models.
 * All requests use authenticated fetchApi from client.
 */

import { fetchApi } from "./client";

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

async function fetchFrameworksApi<T>(path: string): Promise<T> {
  return fetchApi(path) as Promise<T>;
}

export async function fetchFrameworks(): Promise<FrameworkSummary[]> {
  return fetchFrameworksApi<FrameworkSummary[]>("/api/v1/frameworks");
}

export async function fetchFramework(id: string): Promise<FrameworkDetail> {
  return fetchFrameworksApi<FrameworkDetail>(
    `/api/v1/frameworks/${encodeURIComponent(id)}`
  );
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
  return fetchFrameworksApi<PaginatedControls>(
    `/api/v1/frameworks/${encodeURIComponent(id)}/controls?${params}`
  );
}
