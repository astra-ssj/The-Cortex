/**
 * Compliance Overview — what the organisation has demonstrated it can do.
 *
 * Every number here is derived from completed training sessions, so the page
 * deliberately says "competency", not "compliant". A team scoring well on A.8.2
 * has shown it handles privileged access correctly under pressure; it has not
 * shown the control is implemented. Conflating the two would put a claim in front
 * of an auditor that the evidence does not support.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useOrgContext } from "../hooks/useOrgContext";
import {
  useComplianceOverview,
  type ControlStatus,
  type OverviewControl,
} from "../api/compliance";
import { Skeleton, StatCardSkeleton } from "../components/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Tooltip } from "../components/ui/Tooltip";

const STATUS_META: Record<
  ControlStatus,
  { label: string; variant: "success" | "warning" | "danger"; colour: string }
> = {
  strong: { label: "Strong", variant: "success", colour: "var(--green)" },
  developing: { label: "Developing", variant: "warning", colour: "var(--amber)" },
  gap: { label: "Gap", variant: "danger", colour: "var(--red)" },
};

const STATUS_ORDER: ControlStatus[] = ["gap", "developing", "strong"];

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--text-quiet)" }}
      >
        {label}
      </div>
      <div
        className="mt-2 font-bold"
        style={{ fontSize: 28, lineHeight: 1.1, color: tone ?? "var(--text)" }}
      >
        {value}
      </div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {hint}
      </div>
    </div>
  );
}

function CompetencyBar({ value, colour }: { value: number; colour: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--panel)", maxWidth: 120 }}
        role="presentation"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: colour }}
        />
      </div>
      <span
        className="tabular-nums text-[13px] font-semibold"
        style={{ color: "var(--text)", minWidth: 28 }}
      >
        {value}
      </span>
    </div>
  );
}

function ControlRow({
  control,
  onPractise,
}: {
  control: OverviewControl;
  onPractise: (slug: string) => void;
}) {
  const meta = STATUS_META[control.status];
  // Only surface a practise link where there is something to close. A "practise"
  // button on a strong control invites busywork that will not move the number.
  const actionable = control.status !== "strong" && control.scenario_slug !== null;

  return (
    <div
      className="grid items-center gap-4 border-b px-4 py-3 last:border-b-0"
      style={{
        borderColor: "var(--border)",
        gridTemplateColumns: "minmax(0, 1fr) 160px 110px 130px",
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className="font-mono text-[11px] font-semibold uppercase"
            style={{ color: "var(--text-quiet)" }}
          >
            {control.ref}
          </span>
          <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>
            {control.name}
          </span>
        </div>
        {control.dimensions.length > 0 ? (
          <div className="mt-1 text-xs" style={{ color: "var(--text-quiet)" }}>
            Demonstrated through {control.dimensions.join(", ").toLowerCase()}
          </div>
        ) : null}
      </div>

      <CompetencyBar value={control.competency} colour={meta.colour} />

      <div>
        <Badge variant={meta.variant} size="xs">
          {meta.label}
        </Badge>
      </div>

      <div className="text-right">
        {actionable ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onPractise(control.scenario_slug as string)}
          >
            Practise
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ComplianceDashboard() {
  const navigate = useNavigate();
  const { orgId } = useOrgContext();
  const { data, isLoading, error } = useComplianceOverview(orgId);

  const grouped = useMemo(() => {
    const rows = data?.controls ?? [];
    return STATUS_ORDER.map((status) => ({
      status,
      rows: rows.filter((row) => row.status === status),
    })).filter((group) => group.rows.length > 0);
  }, [data?.controls]);

  const onPractise = (slug: string) =>
    navigate(`/learning?scenario=${encodeURIComponent(slug)}`);

  if (isLoading) {
    return (
      <div className="cortex-page-stack" aria-busy="true" aria-live="polite">
        <h1 className="cortex-text-page-title">Compliance Overview</h1>
        <p className="cortex-text-caption mt-2">Deriving posture from completed training…</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div
          className="rounded-lg border"
          style={{ background: "var(--panel)", borderColor: "var(--border)" }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="border-b p-4 last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <Skeleton height={14} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cortex-page-stack">
        <h1 className="cortex-text-page-title">Compliance Overview</h1>
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: "var(--red)",
            background: "var(--tone-error-box-bg)",
            color: "var(--tone-critical-fg)",
          }}
          role="alert"
        >
          <p className="font-medium">Could not load compliance posture</p>
          <p className="mt-1 text-sm">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;
  const assessedNone = summary.controls_assessed === 0;
  const coverage =
    summary.controls_available > 0
      ? Math.round((summary.controls_assessed / summary.controls_available) * 100)
      : 0;

  return (
    <div className="cortex-page-stack" style={{ background: "var(--shell)", color: "var(--text)" }}>
      <header>
        <h1 className="cortex-text-page-title">Compliance Overview</h1>
        <p className="cortex-text-caption mt-2 max-w-2xl">
          {data.org_label} · {data.framework_name}. Competency per control, derived from
          scenarios your team has completed — not from a self-assessment.
        </p>
      </header>

      {assessedNone ? (
        <div
          className="rounded-[10px] border"
          style={{ background: "var(--panel)", borderColor: "var(--border)" }}
        >
          <EmptyState
            badge="NO TRAINING COMPLETED"
            badgeColor="var(--amber)"
            icon="🎯"
            title={`${data.org_label} has no demonstrated competency yet`}
            description={`Posture here is earned, not declared. Complete an audit scenario and the controls it exercises will appear with a competency score. ${summary.controls_available} controls are currently coverable by the scenario library.`}
            cta="Start an audit simulation"
            ctaSecondary="Browse frameworks"
            onCta={() => navigate("/audit-simulator")}
            onCtaSecondary={() => navigate("/frameworks")}
          />
        </div>
      ) : (
        <>
          <section
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Posture summary"
          >
            <StatCard
              label="Controls assessed"
              value={`${summary.controls_assessed}/${summary.controls_available}`}
              hint={`${coverage}% of what the scenario library can exercise`}
            />
            <StatCard
              label="Average competency"
              value={String(summary.average_competency)}
              hint="Mean across assessed controls, 0–100"
            />
            <StatCard
              label="Open gaps"
              value={String(summary.open_gaps)}
              hint="Controls below the gap floor of 60"
              tone={summary.open_gaps > 0 ? "var(--red)" : "var(--green)"}
            />
            <StatCard
              label="Not yet assessed"
              value={String(data.not_assessed.length)}
              hint="Coverable controls no completed session has touched"
            />
          </section>

          <section aria-labelledby="controls-heading">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id="controls-heading" className="cortex-text-section">
                Demonstrated controls
              </h2>
              <Tooltip
                content="Competency is the mean of each learner's latest score for the dimensions that control exercises, averaged across the team. Gaps sort first."
                position="left"
              >
                <span
                  className="cursor-help text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-quiet)" }}
                  tabIndex={0}
                >
                  How this is scored
                </span>
              </Tooltip>
            </div>

            <div
              className="overflow-hidden rounded-lg border"
              style={{ background: "var(--panel)", borderColor: "var(--border)" }}
            >
              {grouped.map((group) => (
                <div key={group.status}>
                  <div
                    className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em]"
                    style={{
                      background: "var(--surface)",
                      color: STATUS_META[group.status].colour,
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    {STATUS_META[group.status].label} · {group.rows.length}
                  </div>
                  {group.rows.map((control) => (
                    <ControlRow key={control.ref} control={control} onPractise={onPractise} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {data.not_assessed.length > 0 ? (
        <section aria-labelledby="not-assessed-heading">
          <h2 id="not-assessed-heading" className="cortex-text-section mb-2">
            Not yet assessed
          </h2>
          <p className="cortex-text-caption mb-4 max-w-2xl">
            Controls the scenario library can exercise but no completed session has reached.
            These are unknowns, not passes.
          </p>
          <div className="flex flex-wrap gap-2">
            {data.not_assessed.map((control) => (
              <span
                key={control.ref}
                className="rounded-full border px-3 py-1 text-xs"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                  color: "var(--text-secondary)",
                }}
              >
                <span className="font-mono font-semibold" style={{ color: "var(--text-quiet)" }}>
                  {control.ref}
                </span>{" "}
                {control.name}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
