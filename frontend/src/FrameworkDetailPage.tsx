import { Link, useParams } from "react-router-dom";
import { useFramework } from "./hooks/useFrameworks";

export function FrameworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: framework, isLoading, error } = useFramework(id ?? null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500">Loading framework…</p>
      </div>
    );
  }

  if (error || !framework) {
    const isAuthError =
      error instanceof Error &&
      (error.message.includes("Invalid or expired token") || error.message.includes("Not authenticated"));
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-medium">Failed to load framework</p>
        <p className="mt-1 text-sm">{error instanceof Error ? error.message : "Not found"}</p>
        {isAuthError ? (
          <p className="mt-2 text-sm text-red-700">Your session may have expired. You should be redirected to sign in.</p>
        ) : (
          <p className="mt-2 text-sm text-red-700">
            Make sure the API is running. From repo root with Python venv active:{" "}
            <code className="rounded bg-red-100 px-1">./scripts/run-api.sh</code>
          </p>
        )}
        <Link to="/" className="mt-3 inline-block text-sm font-medium text-red-700 hover:underline">
          ← Back to frameworks
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/" className="mb-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-800">
        ← Back to frameworks
      </Link>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-slate-800">{framework.name}</h2>
        <p className="mt-1 text-slate-500">
          v{framework.version} · {framework.jurisdiction}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {framework.purpose_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <h3 className="mb-3 font-semibold text-slate-800">Controls ({framework.controls.length})</h3>
      <ul className="space-y-3">
        {framework.controls.map((c) => (
          <li
            key={c.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="font-medium text-slate-800">{c.name}</p>
            {c.domain && <p className="text-sm text-slate-500">{c.domain}</p>}
            <p className="mt-2 text-sm text-slate-600">
              {c.requirements.length} requirement{c.requirements.length !== 1 ? "s" : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
