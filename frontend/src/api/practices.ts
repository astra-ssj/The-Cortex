import { fetchApi } from "./client";

export type PracticeStatus = "available" | "planned";
export type PracticeReviewState = "candidate" | "adapted" | "reviewed";

export interface PracticeCatalogEntry {
  id: string;
  title: string;
  summary: string;
  category: string;
  frameworks: string[];
  tags: string[];
  jurisdiction: string;
  purpose_tags: string[];
  difficulty: "foundation" | "practitioner" | "expert";
  estimated_minutes: number;
  target_dimensions: string[];
  learning_objectives: string[];
  status: PracticeStatus;
  scenario_slug: string | null;
  source_repository: string;
  source_release: string;
  source_commit: string;
  source_path: string;
  content_hash: string;
  license: string;
  author: string;
  review_state: PracticeReviewState;
}

export function getPractices(): Promise<PracticeCatalogEntry[]> {
  return fetchApi<PracticeCatalogEntry[]>("/api/v1/skills/practices");
}
