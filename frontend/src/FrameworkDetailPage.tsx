import { Link, useParams } from "react-router-dom";
import { useFramework } from "./hooks/useFrameworks";

export function FrameworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: framework, isLoading, error } = useFramework(id ?? null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-cortex-muted">Loading framework…</p>
      </div>
    );
  }

  if (error || !framework) {
    return (
      <div className="rounded-xl border border-cortex-red/50 bg-cortex-red/10 p-4 text-cortex-red">
        <p className="font-medium">Failed to load framework</p>
        <p className="mt-1 font-data text-sm">{error instanceof Error ? error.message : "Not found"}</p>
        <Link to="/frameworks" className="mt-3 inline-block text-sm font-medium text-cortex-red hover:underline">
          ← Back to frameworks
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/frameworks" className="mb-4 inline-block text-sm font-medium text-cortex-muted hover:text-cortex-text">
        ← Back to frameworks
      </Link>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-cortex-text">{framework.name}</h2>
        <p className="mt-1 text-cortex-muted">
          v{framework.version} · {framework.jurisdiction}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {framework.purpose_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-cortex-border bg-cortex-surface px-2 py-0.5 font-data text-xs text-cortex-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <h3 className="mb-3 font-semibold text-cortex-text">Controls ({framework.controls.length})</h3>
      <ul className="space-y-3">
        {framework.controls.map((c) => (
          <li
            key={c.id}
            className="rounded-xl border border-cortex-border bg-cortex-panel p-4"
          >
            <p className="font-medium text-cortex-text">{c.name}</p>
            {c.domain && <p className="text-sm text-cortex-muted">{c.domain}</p>}
            <p className="mt-2 font-data text-sm text-cortex-muted">
              {c.requirements.length} requirement{c.requirements.length !== 1 ? "s" : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
