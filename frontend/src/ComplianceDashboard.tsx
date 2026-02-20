import { Link } from "react-router-dom";
import { useFrameworks } from "./hooks/useFrameworks";
import type { FrameworkSummary } from "./api/frameworks";

function FrameworkCard({ fw }: { fw: FrameworkSummary }) {
  return (
    <Link
      to={`/frameworks/${fw.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400"
    >
      <h3 className="font-semibold text-slate-800">{fw.name}</h3>
      <p className="mt-1 text-sm text-slate-500">
        v{fw.version} · {fw.jurisdiction}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {fw.purpose_tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
          >
            {tag}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm font-medium text-slate-600">
        {fw.control_count} control{fw.control_count !== 1 ? "s" : ""}
      </p>
    </Link>
  );
}

export function ComplianceDashboard() {
  const { data: frameworks, isLoading, error } = useFrameworks();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500">Loading frameworks…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-medium">Failed to load frameworks</p>
        <p className="mt-1 text-sm">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }

  if (!frameworks?.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
        No frameworks registered.
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Compliance frameworks</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {frameworks.map((fw) => (
          <FrameworkCard key={fw.id} fw={fw} />
        ))}
      </div>
    </div>
  );
}
