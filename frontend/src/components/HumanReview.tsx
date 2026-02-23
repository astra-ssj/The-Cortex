import { useQuery } from "@tanstack/react-query";
import { assessmentsApi } from "../api/client";

type ReviewItem = {
  id?: string;
  control_id?: string;
  control_name?: string;
  framework_id?: string;
  framework_name?: string;
  confidence_score?: number;
  finding?: string;
  status?: string;
  [key: string]: unknown;
};

export default function HumanReview(_props: { token?: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => assessmentsApi.getReviewQueue(),
    retry: false,
  });

  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const items: ReviewItem[] = Array.isArray(raw.items) ? (raw.items as ReviewItem[]) : [];

  if (isLoading) {
    return (
      <div className="rounded-xl border border-cortex-border bg-cortex-panel p-8 text-center font-data text-sm text-cortex-muted">
        Loading review queue…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-cortex-red/50 bg-cortex-red/10 p-6 text-cortex-red">
        <p className="font-semibold">Failed to load review queue</p>
        <p className="mt-1 font-data text-sm">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-ui text-xl font-semibold text-cortex-text">Human Review Queue</h1>
      <p className="font-data text-sm text-cortex-muted">
        Controls flagged for human review (confidence &lt; 0.75). GDPR Art.22 / EU AI Act Art.14 oversight.
      </p>
      <div className="overflow-x-auto rounded-xl border border-cortex-border bg-cortex-panel">
        <table className="w-full border-collapse font-data text-sm">
          <thead>
            <tr className="border-b border-cortex-border bg-cortex-surface">
              <th className="px-4 py-3 text-left font-semibold text-cortex-text">Control</th>
              <th className="px-4 py-3 text-left font-semibold text-cortex-text">Framework</th>
              <th className="px-4 py-3 text-left font-semibold text-cortex-text">Confidence</th>
              <th className="px-4 py-3 text-left font-semibold text-cortex-text">Finding / Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-cortex-muted">
                  No items pending review.
                </td>
              </tr>
            ) : (
              items.map((item, i) => (
                <tr key={item.id ?? item.control_id ?? i} className="border-b border-cortex-border last:border-0">
                  <td className="px-4 py-3 text-cortex-text">
                    {String(item.control_name ?? item.control_id ?? "—")}
                  </td>
                  <td className="px-4 py-3 text-cortex-muted">
                    {String(item.framework_name ?? item.framework_id ?? "—")}
                  </td>
                  <td className="px-4 py-3 text-cortex-muted">
                    {item.confidence_score != null ? `${(Number(item.confidence_score) * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-cortex-muted">
                    {String(item.finding ?? item.status ?? "—")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
