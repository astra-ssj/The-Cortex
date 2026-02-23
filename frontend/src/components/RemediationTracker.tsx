import { useQuery } from "@tanstack/react-query";
import { findingsApi } from "../api/client";

const COLUMNS = [
  { id: "open", title: "To Do", status: "open" },
  { id: "in_progress", title: "In Progress", status: "in_progress" },
  { id: "done", title: "Done", status: "done" },
] as const;

type Card = {
  id: string;
  title: string;
  framework?: string;
  status: "open" | "in_progress" | "done";
};

function placeCards(findings: unknown[]): Card[] {
  return findings.slice(0, 12).map((item: unknown, i: number) => {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const title = typeof o.title === "string" ? o.title : `Finding ${i + 1}`;
    const framework = typeof o.framework === "string" ? o.framework : undefined;
    const status: Card["status"] = (["open", "in_progress", "done"] as const)[i % 3] ?? "open";
    return { id: `card-${i}`, title, framework, status };
  });
}

export default function RemediationTracker(_props?: { token?: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["findings"],
    queryFn: () => findingsApi.list(),
    retry: false,
  });

  const list = Array.isArray(data) ? data : (data as { items?: unknown[] })?.items ?? [];
  const cards = placeCards(list);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-cortex-border bg-cortex-panel p-6 font-data text-sm text-cortex-muted">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-cortex-border bg-cortex-panel p-6 font-data text-sm text-cortex-amber">
        Findings unavailable: {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const columnCards = cards.filter((c) => c.status === col.status);
        return (
          <div
            key={col.id}
            className="rounded-xl border border-cortex-border bg-cortex-panel flex flex-col min-h-[200px]"
          >
            <div className="border-b border-cortex-border px-4 py-3">
              <h3 className="font-ui text-sm font-semibold text-cortex-text">{col.title}</h3>
              <p className="font-data text-xs text-cortex-muted">{columnCards.length} item(s)</p>
            </div>
            <div className="flex-1 p-3 space-y-2 overflow-y-auto">
              {columnCards.length === 0 ? (
                <p className="font-data text-xs text-cortex-muted italic">No items</p>
              ) : (
                columnCards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-lg border border-cortex-border bg-cortex-surface p-3 font-ui text-sm text-cortex-text shadow-sm"
                  >
                    <p className="font-medium">{card.title}</p>
                    {card.framework && (
                      <p className="mt-1 font-data text-xs text-cortex-muted">{card.framework}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
