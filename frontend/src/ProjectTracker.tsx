import { useState, useMemo, useEffect } from "react";
import {
  ROADMAP_EPICS,
  getRoadmapSummary,
  type RoadmapEpic,
  type RoadmapStory,
  type StoryStatus,
  type EpicStatus,
} from "./store/complianceStore";

const TIMELINE_PHASES = [
  { phase: 2, label: "Phase 2", date: "Apr 2026" },
  { phase: 3, label: "Phase 3", date: "Aug 2026" },
  { phase: 4, label: "Phase 4", date: "Dec 2026" },
] as const;

function storyStatusIcon(status: StoryStatus): string {
  switch (status) {
    case "done":
      return "✅";
    case "in_progress":
      return "🔶";
    default:
      return "❌";
  }
}

function epicProgress(epic: RoadmapEpic): number {
  const done = epic.stories.filter((s) => s.status === "done").length;
  const total = epic.stories.length || 1;
  return Math.round((done / total) * 100);
}

function statusBadgeClass(status: EpicStatus): string {
  switch (status) {
    case "COMPLETE":
      return "bg-cortex-green/20 text-cortex-green border-cortex-green/40";
    case "IN PROGRESS":
      return "bg-cortex-amber/20 text-cortex-amber border-cortex-amber/40 animate-pulse";
    default:
      return "bg-cortex-muted/20 text-cortex-muted border-cortex-border";
  }
}

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "P0":
      return "bg-cortex-red/20 text-cortex-red border border-cortex-red/40";
    case "P1":
      return "bg-cortex-amber/20 text-cortex-amber border border-cortex-amber/40";
    default:
      return "bg-cortex-muted/20 text-cortex-muted border border-cortex-border";
  }
}

function ownerTagClass(owner: string): string {
  switch (owner) {
    case "CORTEX":
      return "bg-cortex-blue/20 text-cortex-blue";
    case "Cursor":
      return "bg-cortex-purple/20 text-cortex-purple";
    default:
      return "bg-cortex-surface text-cortex-muted";
  }
}

type StoryModalStory = RoadmapStory | null;

function AnimatedProgressBar({ percent, className = "" }: { percent: number; className?: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setWidth(percent));
    return () => cancelAnimationFrame(t);
  }, [percent]);
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-cortex-surface ${className}`}>
      <div
        className="h-full rounded-full bg-cortex-blue transition-all duration-700 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function ProjectTracker() {
  const summary = useMemo(() => getRoadmapSummary(), []);
  const [expandedEpicIds, setExpandedEpicIds] = useState<Set<string>>(new Set());
  const [modalStory, setModalStory] = useState<StoryModalStory>(null);

  const toggleEpic = (id: string) => {
    setExpandedEpicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Top summary bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Total Epics</p>
          <p className="mt-1 font-data text-2xl font-bold text-cortex-text">{summary.totalEpics}</p>
        </div>
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Stories Complete</p>
          <p className="mt-1 font-data text-2xl font-bold text-cortex-green">{summary.storiesComplete}</p>
        </div>
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">In Progress</p>
          <p className="mt-1 font-data text-2xl font-bold text-cortex-amber">{summary.storiesInProgress}</p>
        </div>
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Not Started</p>
          <p className="mt-1 font-data text-2xl font-bold text-cortex-muted">{summary.storiesNotStarted}</p>
        </div>
        <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
          <p className="font-data text-xs uppercase tracking-wider text-cortex-muted">Overall Progress</p>
          <p className="mt-1 font-data text-2xl font-bold text-cortex-blue">{summary.overallProgress}%</p>
          <div className="mt-2">
            <AnimatedProgressBar percent={summary.overallProgress} />
          </div>
        </div>
      </div>

      {/* Epic cards */}
      <section>
        <h2 className="mb-4 font-ui text-lg font-semibold text-cortex-text">Epics</h2>
        <div className="space-y-4">
          {ROADMAP_EPICS.map((epic) => {
            const isExpanded = expandedEpicIds.has(epic.id);
            const progress = epicProgress(epic);
            return (
              <div
                key={epic.id}
                className="overflow-hidden rounded-xl border border-cortex-border bg-cortex-panel transition hover:border-cortex-border"
              >
                <button
                  type="button"
                  onClick={() => toggleEpic(epic.id)}
                  className="flex w-full flex-wrap items-center gap-4 p-5 text-left"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="font-data text-sm font-semibold text-cortex-muted">EPIC {epic.number}</span>
                    <span className="font-ui font-semibold text-cortex-text">{epic.title}</span>
                    <span
                      className={`rounded border px-2 py-0.5 font-data text-xs ${statusBadgeClass(epic.status)}`}
                    >
                      {epic.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-data text-xs text-cortex-muted">
                      {epic.stories.filter((s) => s.status === "done").length}/{epic.stories.length} stories
                    </span>
                    <div className="w-24">
                      <AnimatedProgressBar percent={progress} />
                    </div>
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded transition ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <svg className="h-4 w-4 text-cortex-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-cortex-border bg-cortex-surface/50 p-4">
                    <ul className="space-y-2">
                      {epic.stories.map((story) => (
                        <li key={story.id} className="flex flex-wrap items-center gap-2 rounded-lg py-2 pr-2">
                          <span className="font-data text-base" title={story.status}>
                            {storyStatusIcon(story.status)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (story.status === "not_started") setModalStory(story);
                            }}
                            className={`min-w-0 flex-1 text-left font-ui text-sm ${story.status === "not_started" ? "cursor-pointer text-cortex-text hover:underline" : "text-cortex-text"}`}
                          >
                            {story.title}
                          </button>
                          <span
                            className={`rounded border px-2 py-0.5 font-data text-xs ${priorityBadgeClass(story.priority)}`}
                          >
                            {story.priority}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 font-data text-xs ${ownerTagClass(story.owner)}`}
                          >
                            {story.owner}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom timeline bar */}
      <div className="rounded-xl border border-cortex-border bg-cortex-panel p-5">
        <h2 className="mb-4 font-ui text-sm font-semibold text-cortex-text">Timeline</h2>
        <div className="relative flex items-center justify-between gap-4">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-cortex-border" />
          {TIMELINE_PHASES.map(({ phase, label, date }) => (
            <div key={phase} className="relative z-10 flex flex-col items-center">
              <div className="rounded-full border-2 border-cortex-border bg-cortex-panel px-3 py-1.5">
                <span className="font-data text-xs font-medium text-cortex-text">{label}</span>
              </div>
              <span className="mt-1 font-data text-xs text-cortex-muted">{date}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 font-data text-xs text-cortex-muted">
          Current: Feb 2026
        </p>
      </div>

      {/* Modal for not-started story */}
      {modalStory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalStory(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-cortex-border bg-cortex-panel p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-ui text-lg font-semibold text-cortex-text">{modalStory.title}</h3>
            <p className="mt-3 font-ui text-sm text-cortex-muted">
              This feature is on the roadmap.
            </p>
            <p className="mt-2 font-data text-sm text-cortex-text">
              Priority: <span className={priorityBadgeClass(modalStory.priority)}>{modalStory.priority}</span>
            </p>
            <p className="mt-1 font-data text-sm text-cortex-text">
              Phase: {modalStory.phase ?? "—"}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setModalStory(null)}
                className="rounded-lg bg-cortex-blue px-4 py-2 font-ui text-sm font-medium text-white hover:bg-cortex-blue/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
