import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { FrameworkSummary } from "../api/frameworks";
import { reviewQueueQueryKey } from "../api/client";
import { useOrgContext } from "../hooks/useOrgContext";
import { frameworksQueryKey } from "../hooks/useFrameworks";
import { useAssessmentStream } from "../store/complianceStore";
import { postureQueryKey } from "../store/complianceStore";
import type { CompliancePosture } from "../types/compliance";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

type ResultType = "Framework" | "Page" | "Action";

type CommandResult = {
  id: string;
  icon: string;
  type: ResultType;
  title: string;
  subtitle: string;
  onSelect: () => void;
};

type PageItem = {
  title: string;
  route: string;
  icon: string;
};

const PAGE_ITEMS: PageItem[] = [
  { title: "Dashboard", route: "/dashboard", icon: "◫" },
  { title: "Group View", route: "/group", icon: "⊞" },
  { title: "Frameworks", route: "/frameworks", icon: "▦" },
  { title: "Audit Simulator", route: "/intelligence/simulator", icon: "▷" },
  { title: "Review Queue", route: "/review-queue", icon: "⇌" },
  { title: "Findings", route: "/findings", icon: "⚑" },
  { title: "Remediation", route: "/remediation", icon: "↻" },
  { title: "Evidence Vault", route: "/evidence", icon: "▤" },
  { title: "Roadmap", route: "/roadmap", icon: "▸" },
  { title: "Settings", route: "/settings", icon: "⚙" },
  { title: "Help & Documentation", route: "/help", icon: "?" },
];

function TypeBadge({ type }: { type: ResultType }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
        background: "var(--elevated)",
      }}
    >
      {type}
    </span>
  );
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgId } = useOrgContext();
  const { startStream } = useAssessmentStream();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const frameworks =
    queryClient.getQueryData<FrameworkSummary[]>(frameworksQueryKey) ?? [];
  const posture =
    queryClient.getQueryData<CompliancePosture>(postureQueryKey(orgId)) ?? null;
  const reviewQueue =
    queryClient.getQueryData<unknown[]>(reviewQueueQueryKey(orgId)) ?? [];

  const postureByFrameworkId = useMemo(
    () => new Map((posture?.frameworks ?? []).map((f) => [f.frameworkId, f])),
    [posture?.frameworks],
  );

  const findingsCount = posture?.criticalGapsCount ?? 0;
  const reviewCount = reviewQueue.length;

  const frameworkResults = useMemo<CommandResult[]>(
    () =>
      frameworks.map((fw) => {
        const fwPosture = postureByFrameworkId.get(fw.id);
        const scoreText =
          typeof fwPosture?.score === "number" ? `${fwPosture.score}%` : "Unassessed";
        return {
          id: `framework:${fw.id}`,
          icon: "▦",
          type: "Framework",
          title: fw.name,
          subtitle: `${fw.jurisdiction} · ${scoreText}`,
          onSelect: () => navigate(`/frameworks/${encodeURIComponent(fw.id)}`),
        };
      }),
    [frameworks, navigate, postureByFrameworkId],
  );

  const pageResults = useMemo<CommandResult[]>(
    () =>
      PAGE_ITEMS.map((page) => {
        const pageSubtitle =
          page.title === "Findings"
            ? `${findingsCount} open`
            : page.title === "Review Queue"
              ? `${reviewCount} pending`
              : page.route;
        return {
          id: `page:${page.route}`,
          icon: page.icon,
          type: "Page",
          title: page.title,
          subtitle: pageSubtitle,
          onSelect: () => navigate(page.route),
        };
      }),
    [findingsCount, navigate, reviewCount],
  );

  const actionResults = useMemo<CommandResult[]>(
    () => [
      {
        id: "action:run-assessment",
        icon: "▸",
        type: "Action",
        title: "Run Assessment",
        subtitle: "Assess all frameworks",
        onSelect: () => {
          const frameworkIds = frameworks.map((fw) => fw.id);
          if (frameworkIds.length > 0) {
            startStream(orgId, frameworkIds);
          }
          navigate("/dashboard");
        },
      },
    ],
    [frameworks, navigate, orgId, startStream],
  );

  const allResults = useMemo(
    () => [...frameworkResults, ...pageResults, ...actionResults],
    [actionResults, frameworkResults, pageResults],
  );

  const filtered = useMemo(() => {
    const term = normalize(query);
    if (!term) return allResults;
    return allResults.filter((item) =>
      `${item.type} ${item.title} ${item.subtitle}`.toLowerCase().includes(term),
    );
  }, [allResults, query]);

  const visible = filtered.slice(0, 8);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex((idx) => Math.min(idx, Math.max(visible.length - 1, 0)));
  }, [open, visible.length]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(3, 8, 20, 0.68)",
        zIndex: 120,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "10vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(760px, calc(100vw - 40px))",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 28px 80px rgba(0, 0, 0, 0.45)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (visible.length > 0) {
                  setActiveIndex((idx) => (idx + 1) % visible.length);
                }
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                if (visible.length > 0) {
                  setActiveIndex((idx) => (idx - 1 + visible.length) % visible.length);
                }
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const selected = visible[activeIndex];
                if (selected) {
                  selected.onSelect();
                  onClose();
                }
              }
            }}
            placeholder="Search frameworks, pages, and actions..."
            aria-label="Search command palette"
            style={{
              width: "100%",
              fontSize: 16,
              lineHeight: 1.4,
              color: "var(--text)",
              background: "var(--shell)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "12px 14px",
              outline: "none",
            }}
          />
        </div>

        <div style={{ maxHeight: 420, overflowY: "auto", padding: 8 }}>
          {visible.length === 0 ? (
            <div
              style={{
                padding: "14px 12px",
                color: "var(--text-tertiary)",
                fontSize: 13,
              }}
            >
              No results found.
            </div>
          ) : (
            visible.map((item, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    item.onSelect();
                    onClose();
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "grid",
                    gridTemplateColumns: "24px auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 12px",
                    border: "1px solid transparent",
                    borderRadius: 8,
                    color: "var(--text)",
                    background: active ? "var(--card-hover)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 20,
                      textAlign: "center",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {item.icon}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <TypeBadge type={item.type} />
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</span>
                    </span>
                    <span
                      style={{
                        display: "block",
                        marginTop: 2,
                        fontSize: 12,
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {item.subtitle}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
