import { fetchApi, getToken } from "./client";

export interface Governed {
  jurisdiction: string;
  purpose_tags: string[];
}

export interface Cohort extends Governed {
  id: string;
  org_id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  learner_count: number;
  created_at: string | null;
}

export interface Assignment extends Governed {
  id: string;
  org_id: string;
  cohort_id: string | null;
  title: string;
  instructions: string;
  due_at: string | null;
  status: "draft" | "published" | "closed" | "archived";
  practices: string[];
  learner_ids: string[];
  completed_count: number;
  learner_count: number;
}

export interface LearnerProgress extends Governed {
  learner_id: string;
  display_name: string;
  assigned: number;
  completed: number;
  overdue: number;
  last_active_at: string | null;
}

export interface CoachingNote extends Governed {
  id: string;
  learner_id: string;
  author_id: string;
  body: string;
  visibility: "learner_visible" | "private";
  cohort_id: string | null;
  assignment_id: string | null;
  created_at: string;
}

const orgQuery = (orgId: string): string =>
  orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const instructionApi = {
  cohorts: (orgId: string) =>
    fetchApi<Cohort[]>(`/api/v1/instruction/cohorts${orgQuery(orgId)}`),
  createCohort: (orgId: string, body: { name: string; description?: string }) =>
    fetchApi<Cohort>(`/api/v1/instruction/cohorts${orgQuery(orgId)}`, json("POST", body)),
  updateCohort: (orgId: string, id: string, body: Partial<Pick<Cohort, "name" | "description" | "status">>) =>
    fetchApi<Cohort>(
      `/api/v1/instruction/cohorts/${encodeURIComponent(id)}${orgQuery(orgId)}`,
      json("PATCH", body),
    ),
  replaceMembers: (orgId: string, id: string, learnerIds: string[]) =>
    fetchApi<{ status: string; learner_count: number }>(
      `/api/v1/instruction/cohorts/${encodeURIComponent(id)}/members${orgQuery(orgId)}`,
      json("PUT", { learner_ids: learnerIds }),
    ),
  assignments: (orgId: string) =>
    fetchApi<Assignment[]>(`/api/v1/instruction/assignments${orgQuery(orgId)}`),
  assignment: (orgId: string, id: string) =>
    fetchApi<Assignment>(
      `/api/v1/instruction/assignments/${encodeURIComponent(id)}${orgQuery(orgId)}`,
    ),
  createAssignment: (
    orgId: string,
    body: {
      title: string;
      instructions?: string;
      cohort_id?: string;
      due_at?: string;
      status?: Assignment["status"];
      practices?: string[];
      learner_ids?: string[];
    },
  ) => fetchApi<Assignment>(`/api/v1/instruction/assignments${orgQuery(orgId)}`, json("POST", body)),
  updateAssignment: (orgId: string, id: string, body: Partial<Assignment>) =>
    fetchApi<Assignment>(
      `/api/v1/instruction/assignments/${encodeURIComponent(id)}${orgQuery(orgId)}`,
      json("PATCH", body),
    ),
  updateMyAssignmentStatus: (
    orgId: string,
    id: string,
    status: "in_progress" | "completed",
  ) =>
    fetchApi<{ status: string }>(
      `/api/v1/instruction/assignments/${encodeURIComponent(id)}/status${orgQuery(orgId)}`,
      json("POST", { status }),
    ),
  progress: (orgId: string, cohortId?: string) => {
    const params = new URLSearchParams({ org_id: orgId });
    if (cohortId) params.set("cohort_id", cohortId);
    return fetchApi<LearnerProgress[]>(`/api/v1/instruction/progress?${params.toString()}`);
  },
  notes: (orgId: string, learnerId: string) =>
    fetchApi<CoachingNote[]>(
      `/api/v1/instruction/learners/${encodeURIComponent(learnerId)}/notes${orgQuery(orgId)}`,
    ),
  createNote: (
    orgId: string,
    learnerId: string,
    body: {
      body: string;
      visibility: CoachingNote["visibility"];
      cohort_id?: string;
      assignment_id?: string;
    },
  ) =>
    fetchApi<CoachingNote>(
      `/api/v1/instruction/learners/${encodeURIComponent(learnerId)}/notes${orgQuery(orgId)}`,
      json("POST", body),
    ),
  exportUrl: (orgId: string, format: "csv" | "json", cohortId?: string) => {
    const params = new URLSearchParams({ org_id: orgId, format });
    if (cohortId) params.set("cohort_id", cohortId);
    return `/api/v1/instruction/export?${params.toString()}`;
  },
  downloadProgress: async (orgId: string, format: "csv" | "json", cohortId?: string) => {
    const url = instructionApi.exportUrl(orgId, format, cohortId);
    const token = getToken();
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error(`Export failed (HTTP ${response.status})`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `learner-progress.${format}`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  },
};
