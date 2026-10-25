import { type CSSProperties, type FormEvent, type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { instructionApi } from "../api/instruction";
import { getPractices } from "../api/practices";
import { Skeleton } from "../components/Skeleton";
import { useOrgContext } from "../hooks/useOrgContext";
import { useRole } from "../hooks/useRole";

export default function InstructorDashboard() {
  const { orgId } = useOrgContext();
  const { can } = useRole();
  const queryClient = useQueryClient();
  const allowed = can("canCoachLearners");
  const canManage = can("canManageCurriculum");
  const [name, setName] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [practiceSlug, setPracticeSlug] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [noteLearner, setNoteLearner] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"learner_visible" | "private">("learner_visible");

  const cohorts = useQuery({
    queryKey: ["instruction-cohorts", orgId],
    queryFn: () => instructionApi.cohorts(orgId),
    enabled: allowed,
  });
  const assignments = useQuery({
    queryKey: ["instruction-assignments", orgId],
    queryFn: () => instructionApi.assignments(orgId),
    enabled: allowed,
  });
  const progress = useQuery({
    queryKey: ["instruction-progress", orgId],
    queryFn: () => instructionApi.progress(orgId),
    enabled: allowed,
  });
  const practices = useQuery({
    queryKey: ["practice-catalog"],
    queryFn: getPractices,
    enabled: allowed && canManage,
  });
  const createCohort = useMutation({
    mutationFn: (cohortName: string) => instructionApi.createCohort(orgId, { name: cohortName }),
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["instruction-cohorts", orgId] });
      window.requestAnimationFrame(() => document.getElementById("cohorts-heading")?.focus());
    },
  });
  const createAssignment = useMutation({
    mutationFn: () => instructionApi.createAssignment(orgId, {
      title: assignmentTitle.trim(),
      cohort_id: cohortId || undefined,
      due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
      status: "published",
      practices: practiceSlug.trim() ? [practiceSlug.trim()] : [],
    }),
    onSuccess: async () => {
      setAssignmentTitle("");
      setPracticeSlug("");
      setDueAt("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["instruction-assignments", orgId] }),
        queryClient.invalidateQueries({ queryKey: ["instruction-progress", orgId] }),
      ]);
      window.requestAnimationFrame(() => document.getElementById("assignments-heading")?.focus());
    },
  });
  const createNote = useMutation({
    mutationFn: () => instructionApi.createNote(orgId, noteLearner, {
      body: noteBody.trim(),
      visibility: noteVisibility,
    }),
    onSuccess: () => {
      const learnerId = noteLearner;
      setNoteLearner("");
      setNoteBody("");
      window.requestAnimationFrame(() => document.getElementById(`note-${learnerId}`)?.focus());
    },
  });

  if (!allowed) {
    return <Message title="Instructor dashboard is restricted" text="You do not have permission to coach learners." />;
  }

  const pending = cohorts.isPending || assignments.isPending || progress.isPending;
  const failed = cohorts.isError || assignments.isError || progress.isError;
  const learners = progress.data ?? [];
  const overdue = learners.reduce((sum, learner) => sum + learner.overdue, 0);

  function submitCohort(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (value) createCohort.mutate(value);
  }

  function submitAssignment(event: FormEvent) {
    event.preventDefault();
    if (assignmentTitle.trim()) createAssignment.mutate();
  }

  return (
    <div style={{ paddingTop: 8, display: "grid", gap: 22 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 24 }}>Instructor Dashboard</h1>
        <p style={muted}>Assign governed practices, monitor deadlines, and coach without making decisions for learners.</p>
      </header>

      {pending ? (
        <div role="status" aria-label="Loading instructor dashboard" style={{ display: "grid", gap: 12 }}>
          <Skeleton height="100px" />
          <Skeleton height="220px" />
        </div>
      ) : failed ? (
        <Message title="Could not load instructor data" text="Try refreshing. No learner records were changed." />
      ) : (
        <>
          <section style={stats}>
            <Stat label="Active cohorts" value={(cohorts.data ?? []).filter((item) => item.status === "active").length} />
            <Stat label="Assignments" value={(assignments.data ?? []).length} />
            <Stat label="Learners" value={learners.length} />
            <Stat label="Overdue" value={overdue} warning={overdue > 0} />
          </section>

          <section style={panel}>
            <div style={sectionHeading}>
              <div>
                <h2 id="cohorts-heading" tabIndex={-1} style={heading}>Cohorts</h2>
                <p style={muted}>Tenant-scoped learner groups.</p>
              </div>
              <form onSubmit={submitCohort} style={{ display: "flex", gap: 8 }}>
                <input
                  aria-label="Cohort name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="New cohort name"
                  maxLength={160}
                  style={input}
                />
                <button className="cortex-btn-primary" disabled={!name.trim() || createCohort.isPending}>
                  {createCohort.isPending ? "Creating…" : "Create"}
                </button>
              </form>
            </div>
            {(cohorts.data ?? []).length === 0 ? (
              <Empty text="No cohorts yet. Create one to group learners." />
            ) : (
              <div style={cards}>
                {(cohorts.data ?? []).map((cohort) => (
                  <article key={cohort.id} style={card}>
                    <strong>{cohort.name}</strong>
                    <span style={muted}>{cohort.learner_count} learners · {cohort.status}</span>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section style={panel}>
            <div style={sectionHeading}>
              <div>
                <h2 id="assignments-heading" tabIndex={-1} style={heading}>Assignments</h2>
                <p style={muted}>Due dates and completion stay separate from learner decisions.</p>
              </div>
              {!canManage && <span style={muted}>View only</span>}
            </div>
            {canManage && (
              <form onSubmit={submitAssignment} style={{ ...cards, marginBottom: 14 }}>
                <input aria-label="Assignment title" value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} placeholder="Assignment title" maxLength={200} style={input} />
                <select aria-label="Practice" value={practiceSlug} onChange={(event) => setPracticeSlug(event.target.value)} style={input}>
                  <option value="">Select reviewed practice (optional)</option>
                  {(practices.data ?? []).filter((practice) => practice.status === "available").map((practice) => (
                    <option key={practice.id} value={practice.scenario_slug ?? ""}>
                      {practice.title} · {practice.difficulty} · quality {practice.quality_score}/100
                    </option>
                  ))}
                </select>
                <select aria-label="Assignment cohort" value={cohortId} onChange={(event) => setCohortId(event.target.value)} style={input}>
                  <option value="">Select cohort (optional)</option>
                  {(cohorts.data ?? []).filter((cohort) => cohort.status === "active").map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
                </select>
                <input aria-label="Due date" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} style={input} />
                <button className="cortex-btn-primary" disabled={!assignmentTitle.trim() || createAssignment.isPending}>
                  {createAssignment.isPending ? "Publishing…" : "Publish assignment"}
                </button>
              </form>
            )}
            {(assignments.data ?? []).length === 0 ? (
              <Empty text={canManage ? "No assignments yet." : "No assignments are available."} />
            ) : (
              <div style={cards}>
                {(assignments.data ?? []).map((assignment) => (
                  <Link key={assignment.id} to={`/instructor/assignments/${assignment.id}`} style={{ ...card, textDecoration: "none", color: "inherit" }}>
                    <strong>{assignment.title}</strong>
                    <span style={muted}>
                      {assignment.completed_count}/{assignment.learner_count} complete · {assignment.status}
                    </span>
                    <span style={muted}>Due {formatDate(assignment.due_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section style={panel}>
            <div style={sectionHeading}>
              <div>
                <h2 style={heading}>Learner progress</h2>
                <p style={muted}>Assignment completion and overdue summaries.</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="cortex-btn-ghost" onClick={() => void instructionApi.downloadProgress(orgId, "csv")}>CSV</button>
                <button className="cortex-btn-ghost" onClick={() => void instructionApi.downloadProgress(orgId, "json")}>JSON</button>
              </div>
            </div>
            {learners.length === 0 ? (
              <Empty text="No targeted learners yet." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <caption className="sr-only">Learner assignment progress and coaching actions</caption>
                  <thead><tr><Th>Learner</Th><Th>Assigned</Th><Th>Completed</Th><Th>Overdue</Th><Th>Coaching</Th></tr></thead>
                  <tbody>
                    {learners.map((learner) => (
                      <tr key={learner.learner_id}>
                        <Td>{learner.display_name || learner.learner_id}</Td>
                        <Td>{learner.assigned}</Td><Td>{learner.completed}</Td>
                        <Td><span style={{ color: learner.overdue ? "var(--red)" : "inherit" }}>{learner.overdue} {learner.overdue ? "overdue" : "on time"}</span></Td>
                        <Td><button id={`note-${learner.learner_id}`} className="cortex-btn-ghost" onClick={() => setNoteLearner(learner.learner_id)}>Add note</button></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {noteLearner && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (noteBody.trim()) createNote.mutate();
                }}
                style={{ ...card, marginTop: 14 }}
              >
                <strong>Coaching note</strong>
                <textarea aria-label="Coaching note" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} maxLength={8000} rows={3} style={input} />
                <select aria-label="Note visibility" value={noteVisibility} onChange={(event) => setNoteVisibility(event.target.value as "learner_visible" | "private")} style={input}>
                  <option value="learner_visible">Visible to learner</option>
                  <option value="private">Private instructor note</option>
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="cortex-btn-primary" disabled={!noteBody.trim() || createNote.isPending}>Save note</button>
                  <button type="button" className="cortex-btn-ghost" onClick={() => setNoteLearner("")}>Cancel</button>
                </div>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <div style={card}><span style={muted}>{label}</span><strong style={{ fontSize: 25, color: warning ? "var(--red)" : "var(--text)" }}>{value}</strong></div>;
}
function Message({ title, text }: { title: string; text: string }) {
  return <div style={{ ...panel, textAlign: "center", padding: 44 }}><strong>{title}</strong><p style={muted}>{text}</p></div>;
}
function Empty({ text }: { text: string }) {
  return <p style={{ ...muted, padding: "22px 0", textAlign: "center" }}>{text}</p>;
}
function Th({ children }: { children: ReactNode }) {
  return <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>{children}</th>;
}
function Td({ children }: { children: ReactNode }) {
  return <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{children}</td>;
}
function formatDate(value: string | null): string {
  if (!value) return "not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

const panel: CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 };
const stats: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 };
const cards: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 };
const card: CSSProperties = { display: "grid", gap: 7, padding: 14, border: "1px solid var(--border)", borderRadius: 8, background: "var(--elevated)" };
const muted: CSSProperties = { color: "var(--text-secondary)", fontSize: 13, margin: "6px 0 0" };
const heading: CSSProperties = { margin: 0, fontSize: 17 };
const sectionHeading: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 };
const input: CSSProperties = { minWidth: 190, border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", background: "var(--elevated)", color: "var(--text)" };
