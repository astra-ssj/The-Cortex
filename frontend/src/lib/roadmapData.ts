// ─── Roadmap types (epics + stories) ───────────────────────────────────────
export type StoryStatus = "done" | "in_progress" | "not_started";
export type Priority = "P0" | "P1" | "P2";
export type StoryOwner = "CORTEX" | "Cursor" | "Manual";
export type EpicStatus = "COMPLETE" | "IN PROGRESS" | "NOT STARTED";

export interface RoadmapStory {
  id: string;
  title: string;
  status: StoryStatus;
  priority: Priority;
  owner: StoryOwner;
  phase?: 2 | 3 | 4;
}

export interface RoadmapEpic {
  id: string;
  number: number;
  title: string;
  status: EpicStatus;
  stories: RoadmapStory[];
}

export const ROADMAP_EPICS: RoadmapEpic[] = [
  {
    id: "epic-1",
    number: 1,
    title: "Foundation",
    status: "COMPLETE",
    stories: [
      { id: "s1-1", title: "ZTAIP Architecture", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-2", title: "Organisational Ontology", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-3", title: "8 Compliance Frameworks — 491 controls", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-4", title: "Assessment Engine with LLM routing", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-5", title: "Immutable Audit Fabric", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-6", title: "Circuit Breakers", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-7", title: "Dynamic Autonomy Router", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-8", title: "Docker deployment", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s1-9", title: "CI/CD Pipeline", status: "done", priority: "P1", owner: "Cursor", phase: 2 },
      { id: "s1-10", title: "PostgreSQL schema + ontology", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
    ],
  },
  {
    id: "epic-2",
    number: 2,
    title: "Core Intelligence",
    status: "IN PROGRESS",
    stories: [
      { id: "s2-1", title: "Assessment Engine with SSE streaming", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-2", title: "Framework posture display", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-3", title: "Dark intelligence dashboard", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-4", title: "AstraLabs org data seeded", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-5", title: "Real posture scores", status: "in_progress", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-6", title: "Trend data from historical runs", status: "done", priority: "P1", owner: "CORTEX", phase: 2 },
      { id: "s2-7", title: "Human Review Workflow (GDPR Art.22)", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-8", title: "Remediation Tracker with Kanban", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s2-9", title: "Audit Report Generator", status: "done", priority: "P1", owner: "Cursor", phase: 2 },
      { id: "s2-10", title: "Multi-Entity Group Dashboard", status: "done", priority: "P1", owner: "Cursor", phase: 2 },
    ],
  },
  {
    id: "epic-3",
    number: 3,
    title: "Data Ingestion",
    status: "IN PROGRESS",
    stories: [
      { id: "s3-1", title: "Org structure seeded (6 entities)", status: "done", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s3-2", title: "Mock compliance policies (3 ISO 27001 docs)", status: "done", priority: "P1", owner: "Cursor", phase: 2 },
      { id: "s3-3", title: "Document ingestion pipeline", status: "done", priority: "P1", owner: "CORTEX", phase: 2 },
      { id: "s3-4", title: "Azure connector", status: "done", priority: "P1", owner: "CORTEX", phase: 2 },
      { id: "s3-5", title: "AWS connector", status: "in_progress", priority: "P1", owner: "CORTEX", phase: 2 },
      { id: "s3-6", title: "HR system import", status: "not_started", priority: "P2", owner: "Manual", phase: 3 },
      { id: "s3-7", title: "Real-time scanning", status: "not_started", priority: "P2", owner: "Manual", phase: 3 },
      { id: "s3-8", title: "Test document ingestion", status: "not_started", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s3-9", title: "Test Azure connector", status: "not_started", priority: "P0", owner: "CORTEX", phase: 2 },
      { id: "s3-10", title: "Test AWS connector", status: "not_started", priority: "P0", owner: "CORTEX", phase: 2 },
    ],
  },
  {
    id: "epic-4",
    number: 4,
    title: "Intelligence Altitudes",
    status: "NOT STARTED",
    stories: [
      { id: "s4-1", title: "Board altitude view", status: "not_started", priority: "P0", owner: "CORTEX", phase: 3 },
      { id: "s4-2", title: "C-Suite altitude view", status: "not_started", priority: "P1", owner: "CORTEX", phase: 3 },
      { id: "s4-3", title: "Management altitude view", status: "not_started", priority: "P1", owner: "CORTEX", phase: 3 },
      { id: "s4-4", title: "Multi-entity consolidated posture", status: "not_started", priority: "P0", owner: "CORTEX", phase: 3 },
      { id: "s4-5", title: "Regulatory horizon tracking", status: "not_started", priority: "P2", owner: "Manual", phase: 3 },
      { id: "s4-6", title: "Cross-framework intelligence engine", status: "not_started", priority: "P1", owner: "CORTEX", phase: 3 },
      { id: "s4-7", title: "Risk register view", status: "not_started", priority: "P1", owner: "CORTEX", phase: 3 },
      { id: "s4-8", title: "Evidence library view", status: "not_started", priority: "P1", owner: "Cursor", phase: 3 },
    ],
  },
  {
    id: "epic-5",
    number: 5,
    title: "Commercial Readiness",
    status: "NOT STARTED",
    stories: [
      { id: "s5-1", title: "Authentication + JWT", status: "not_started", priority: "P0", owner: "CORTEX", phase: 3 },
      { id: "s5-2", title: "Role-based access control", status: "not_started", priority: "P0", owner: "CORTEX", phase: 3 },
      { id: "s5-3", title: "Multi-tenant architecture", status: "not_started", priority: "P0", owner: "CORTEX", phase: 3 },
      { id: "s5-4", title: "Self-serve onboarding", status: "not_started", priority: "P1", owner: "Cursor", phase: 3 },
      { id: "s5-5", title: "SOC 2 framework", status: "not_started", priority: "P1", owner: "Cursor", phase: 3 },
      { id: "s5-6", title: "DORA framework", status: "not_started", priority: "P1", owner: "Cursor", phase: 3 },
      { id: "s5-7", title: "Subscription + billing", status: "not_started", priority: "P2", owner: "Manual", phase: 4 },
      { id: "s5-8", title: "White-label theming", status: "not_started", priority: "P2", owner: "Manual", phase: 4 },
    ],
  },
];

export function getRoadmapSummary() {
  let storiesComplete = 0;
  let storiesInProgress = 0;
  let storiesNotStarted = 0;
  ROADMAP_EPICS.forEach((epic) => {
    epic.stories.forEach((s) => {
      if (s.status === "done") storiesComplete += 1;
      else if (s.status === "in_progress") storiesInProgress += 1;
      else storiesNotStarted += 1;
    });
  });
  const total = storiesComplete + storiesInProgress + storiesNotStarted;
  const overallProgress = total ? Math.round((storiesComplete / total) * 100) : 0;
  return {
    totalEpics: ROADMAP_EPICS.length,
    storiesComplete,
    storiesInProgress,
    storiesNotStarted,
    totalStories: total,
    overallProgress,
  };
}
