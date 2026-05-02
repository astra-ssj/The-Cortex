import { Link, useParams } from "react-router-dom";
import { useFramework } from "./hooks/useFrameworks";

export function FrameworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: framework, isLoading, error } = useFramework(id ?? null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-cortex-muted">Loading framework…</p>
      </div>
    );
  }

  if (error || !framework) {
    const isAuthError =
      error instanceof Error &&
      (error.message.includes("Invalid or expired token") || error.message.includes("Not authenticated"));
    return (
      <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-red-200">
        <p className="font-medium text-red-100">Failed to load framework</p>
        <p className="mt-1 text-sm text-red-300/90">{error instanceof Error ? error.message : "Not found"}</p>
        {isAuthError ? (
          <p className="mt-2 text-sm text-red-300/80">Your session may have expired. Sign in again.</p>
        ) : (
          <p className="mt-2 text-sm text-red-300/80">
            Make sure the API is running. From repo root:{" "}
            <code className="rounded bg-red-950/80 px-1.5 py-0.5 font-mono text-xs text-red-200">
              ./scripts/run-api.sh
            </code>
          </p>
        )}
        <Link
          to="/frameworks"
          className="mt-3 inline-block text-sm font-medium text-red-300 hover:text-red-100 hover:underline"
        >
          ← Back to frameworks
        </Link>
      </div>
    );
  }

  return (
    <div className="text-cortex-text">
      <Link
        to="/frameworks"
        className="mb-4 inline-block text-sm font-medium text-cortex-muted hover:text-cortex-text"
      >
        ← Back to frameworks
      </Link>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-[#f1f5f9]" style={{ fontFamily: "'Syne', sans-serif" }}>
          {framework.name}
        </h2>
        <p className="mt-1 text-sm text-cortex-muted">
          v{framework.version} · {framework.jurisdiction}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {framework.purpose_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-cortex-border bg-cortex-panel px-2 py-0.5 text-xs text-cortex-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <h3 className="mb-3 text-base font-semibold text-[#e2e8f4]">
        Controls ({framework.controls.length})
      </h3>
      <ul className="space-y-3">
        {framework.controls.map((c) => (
          <li
            key={c.id}
            className="rounded-lg border border-cortex-border bg-[#0d1526] p-4 shadow-sm transition-colors hover:border-[#1e2e48]"
          >
            <p className="font-medium text-[#e2e8f4]">{c.name}</p>
            {c.domain && <p className="text-sm text-cortex-muted">{c.domain}</p>}
            <p className="mt-2 text-sm text-cortex-muted">
              {c.requirements.length} requirement{c.requirements.length !== 1 ? "s" : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
