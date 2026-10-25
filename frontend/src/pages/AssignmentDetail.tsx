import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { instructionApi } from "../api/instruction";
import { Skeleton } from "../components/Skeleton";
import { useOrgContext } from "../hooks/useOrgContext";
import { useRole } from "../hooks/useRole";

export default function AssignmentDetail() {
  const { assignmentId = "" } = useParams();
  const { orgId } = useOrgContext();
  const { can } = useRole();
  const allowed = can("canCoachLearners");
  const assignment = useQuery({
    queryKey: ["instruction-assignment", orgId, assignmentId],
    queryFn: () => instructionApi.assignment(orgId, assignmentId),
    enabled: allowed && Boolean(assignmentId),
  });

  if (!allowed) return <State title="Assignment restricted" detail="You do not have instructor access." />;
  if (assignment.isPending) return <Skeleton height="240px" />;
  if (assignment.isError || !assignment.data) return <State title="Assignment unavailable" detail="It may have been archived or you may no longer have access." />;

  const item = assignment.data;
  return (
    <div style={{ paddingTop: 8 }}>
      <Link to="/instructor" style={{ color: "var(--blue)", fontSize: 13 }}>← Instructor Dashboard</Link>
      <article style={{ marginTop: 18, padding: 22, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
        <span style={{ color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase" }}>{item.status}</span>
        <h1 style={{ margin: "8px 0", fontSize: 24 }}>{item.title}</h1>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>{item.instructions || "No additional instructions."}</p>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginTop: 22 }}>
          <Metric label="Due" value={item.due_at ? new Date(item.due_at).toLocaleString() : "Not set"} />
          <Metric label="Learners" value={String(item.learner_count)} />
          <Metric label="Completed" value={String(item.completed_count)} />
          <Metric label="Practices" value={String(item.practices.length)} />
        </dl>
        <h2 style={{ fontSize: 16, marginTop: 24 }}>Assigned practices</h2>
        {item.practices.length ? (
          <ul>{item.practices.map((practice) => <li key={practice}>{practice}</li>)}</ul>
        ) : (
          <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>No practices targeted.</p>
        )}
      </article>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt style={{ color: "var(--text-secondary)", fontSize: 12 }}>{label}</dt><dd style={{ margin: "5px 0 0", fontWeight: 700 }}>{value}</dd></div>;
}
function State({ title, detail }: { title: string; detail: string }) {
  return <div style={{ padding: 36, textAlign: "center" }}><strong>{title}</strong><p style={{ color: "var(--text-secondary)" }}>{detail}</p></div>;
}
