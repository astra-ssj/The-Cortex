import { useCallback, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLearningSession,
  decideLearningSession,
  getLearningSession,
  getScenarios,
  type CompetencyDimension,
  type LearningSession,
  type ScenarioSummary,
} from "../api/learning";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/Skeleton";
import { useOrgContext } from "../hooks/useOrgContext";

const panel: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-5)",
};

function riskColor(risk: string | null | undefined): string {
  if (risk === "over-provisioned") return "var(--red)";
  if (risk === "controlled") return "var(--green)";
  if (risk === "blocked") return "var(--amber)";
  if (risk === "under_review") return "var(--cyan)";
  return "var(--text-secondary)";
}

const DIMENSION_ORDER = [
  "control_mapping",
  "evidence",
  "escalation",
  "remediation",
] as const;

const DIMENSION_LABELS: Record<(typeof DIMENSION_ORDER)[number], string> = {
  control_mapping: "Control Mapping",
  evidence: "Evidence Quality",
  escalation: "Escalation Judgment",
  remediation: "Remediation",
};

function CompetencyPanel({
  competency,
}: {
  competency: Record<string, CompetencyDimension>;
}) {
  return (
    <div
      aria-label="Competency scores"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        marginBottom: 20,
      }}
    >
      {DIMENSION_ORDER.map((key) => {
        const dim = competency[key];
        if (!dim) return null;
        const score = Math.max(0, Math.min(100, Number(dim.score) || 0));
        const delta = dim.delta ?? 0;
        const latest = dim.observations?.length
          ? dim.observations[dim.observations.length - 1]
          : "";
        const mark = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
        const color =
          delta > 0 ? "var(--green)" : delta < 0 ? "var(--red)" : "var(--text-secondary)";
        return (
          <div
            key={key}
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
                {DIMENSION_LABELS[key]}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color }} aria-label={`delta ${delta}`}>
                {mark} {score}
              </span>
            </div>
            <div
              style={{
                marginTop: 8,
                height: 4,
                borderRadius: 2,
                background: "var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${score}%`,
                  height: "100%",
                  background: "var(--cyan)",
                }}
              />
            </div>
            {latest ? (
              <p style={{ margin: "8px 0 0", fontSize: 11, lineHeight: 1.45, color: "var(--text-secondary)" }}>
                {latest}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function LearningLoopSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
      <div style={panel}>
        <Skeleton height="18px" width="40%" style={{ marginBottom: 16 }} />
        <Skeleton height="72px" style={{ marginBottom: 16 }} />
        <Skeleton height="48px" style={{ marginBottom: 12 }} />
        <Skeleton height="48px" />
      </div>
      <div style={panel}>
        <Skeleton height="18px" width="50%" style={{ marginBottom: 16 }} />
        <Skeleton height="160px" />
      </div>
    </div>
  );
}

function difficultyColor(difficulty: string): string {
  if (difficulty === "foundation") return "var(--cyan)";
  if (difficulty === "practitioner") return "var(--amber)";
  if (difficulty === "expert") return "var(--red)";
  return "var(--text-secondary)";
}

function truncateBrief(brief: string, max = 120): string {
  const trimmed = brief.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function ScenarioSelectorSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[0, 1].map((i) => (
        <div key={i} style={panel}>
          <Skeleton height="18px" width="55%" style={{ marginBottom: 12 }} />
          <Skeleton height="14px" width="28%" style={{ marginBottom: 12 }} />
          <Skeleton height="48px" style={{ marginBottom: 16 }} />
          <Skeleton height="36px" width="140px" />
        </div>
      ))}
    </div>
  );
}

function ScenarioSelector({
  onStart,
  startingSlug,
}: {
  onStart: (slug: string) => void;
  startingSlug: string | null;
}) {
  const query = useQuery({
    queryKey: ["learning-scenarios"],
    queryFn: getScenarios,
  });

  if (query.isPending) return <ScenarioSelectorSkeleton />;
  if (query.isError) {
    return (
      <EmptyState
        icon="⚠"
        title="Scenarios unavailable"
        description="The scenario catalogue could not be loaded. Check your connection and try again."
        badge="ACCESS"
        badgeColor="var(--amber)"
        cta="Retry"
        onCta={() => { void query.refetch(); }}
      />
    );
  }

  const scenarios: ScenarioSummary[] = query.data ?? [];
  if (scenarios.length === 0) {
    return (
      <EmptyState
        icon="↻"
        title="No scenarios available"
        description="There are no active scenarios to start right now."
        badge="LEARNING LOOP"
        badgeColor="var(--cyan)"
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {scenarios.map((s) => {
        const color = difficultyColor(s.difficulty);
        const starting = startingSlug === s.slug;
        return (
          <article key={s.slug} style={panel} aria-label={s.title}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                {s.title}
              </h2>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color,
                  border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
                  borderRadius: 999,
                  padding: "2px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                {s.difficulty}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {s.frameworks.map((fw) => (
                <span
                  key={fw}
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    padding: "2px 8px",
                  }}
                >
                  {fw}
                </span>
              ))}
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)" }}>
              {truncateBrief(s.brief)}
            </p>
            <Button
              variant="primary"
              size="md"
              type="button"
              disabled={startingSlug !== null}
              onClick={() => onStart(s.slug)}
            >
              {starting ? "Starting…" : "Start scenario"}
            </Button>
          </article>
        );
      })}
    </div>
  );
}

export default function LearningLoop() {
  const { orgId } = useOrgContext();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(
    () => localStorage.getItem("cortex_learning_session_id"),
  );
  const showEngineRoom = import.meta.env.DEV;

  const sessionQuery = useQuery({
    queryKey: ["learning-session", sessionId, orgId],
    queryFn: () => getLearningSession(sessionId!, orgId),
    enabled: Boolean(sessionId),
  });

  const createMut = useMutation({
    mutationFn: (slug: string) =>
      createLearningSession({ org_id: orgId, scenario_slug: slug }),
    onSuccess: (s) => {
      localStorage.setItem("cortex_learning_session_id", s.id);
      setSessionId(s.id);
      void qc.invalidateQueries({ queryKey: ["learning-session", s.id] });
    },
  });

  const decideMut = useMutation({
    mutationFn: (choice: string) =>
      decideLearningSession(sessionId!, choice, orgId),
    onSuccess: (s) => {
      qc.setQueryData(["learning-session", s.id, orgId], s);
    },
  });

  const onStart = useCallback(
    (slug: string) => {
      createMut.mutate(slug);
    },
    [createMut],
  );

  const onReset = useCallback(() => {
    localStorage.removeItem("cortex_learning_session_id");
    setSessionId(null);
    qc.removeQueries({ queryKey: ["learning-session"] });
  }, [qc]);

  const session: LearningSession | undefined = sessionQuery.data;
  const choices = (session?.state?.choices as { id: string; label: string }[] | undefined) ?? [];
  const messages =
    (session?.state?.messages as
      | { speaker: string; stance: string; message: string; demands?: string[] }[]
      | undefined) ?? [];
  const brief = String(session?.state?.brief ?? "");

  return (
    <div style={{ paddingTop: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              fontWeight: 700,
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            LEARN
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: "var(--text)",
              fontFamily: "var(--font-sans)",
            }}
          >
            Learning Loop
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              color: "var(--text-secondary)",
              fontSize: 13,
              maxWidth: 560,
            }}
          >
            One-agent onboarding scenario — you decide; the DevOps Lead responds through the
            harness. The controller owns stage and risk.
          </p>
        </div>
        {sessionId ? (
          <Button variant="secondary" size="sm" type="button" onClick={onReset}>
            New session
          </Button>
        ) : null}
      </div>

      {!sessionId ? (
        <>
          <ScenarioSelector
            onStart={onStart}
            startingSlug={createMut.isPending ? (createMut.variables ?? null) : null}
          />
          {createMut.isError ? (
            <p style={{ marginTop: 12, color: "var(--red)", fontSize: 12 }}>
              Could not start this scenario — try again.
            </p>
          ) : null}
        </>
      ) : sessionQuery.isPending || createMut.isPending ? (
        <LearningLoopSkeleton />
      ) : sessionQuery.isError ? (
        <EmptyState
          icon="⚠"
          title="Session unavailable"
          description="This session may belong to another organisation, or the API could not load it. Start a new session to continue."
          badge="ACCESS"
          badgeColor="var(--amber)"
          cta="Start new session"
          onCta={onReset}
        />
      ) : session ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: showEngineRoom ? "1.4fr 1fr" : "1fr",
            gap: 20,
            alignItems: "start",
          }}
        >
          <section style={panel} aria-label="Scenario interaction">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 16,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "var(--text-secondary)",
                }}
              >
                STAGE · {session.stage.toUpperCase()}
              </span>
              {session.risk ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: riskColor(session.risk),
                    border: `1px solid color-mix(in srgb, ${riskColor(session.risk)} 40%, transparent)`,
                    borderRadius: 4,
                    padding: "2px 8px",
                  }}
                >
                  RISK · {session.risk}
                </span>
              ) : null}
            </div>

            <div
              style={{
                marginBottom: 18,
                padding: 14,
                background: "color-mix(in srgb, var(--cyan) 8%, transparent)",
                borderLeft: "3px solid var(--cyan)",
                borderRadius: 4,
                color: "var(--text)",
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              {brief || "Scenario brief loading…"}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {messages.map((m, i) => (
                <div
                  key={`${m.speaker}-${i}`}
                  style={{
                    padding: 14,
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <strong style={{ fontSize: 13, color: "var(--text)" }}>{m.speaker}</strong>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{m.stance}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>
                    {m.message}
                  </p>
                  {m.demands && m.demands.length > 0 ? (
                    <ul
                      style={{
                        margin: "10px 0 0",
                        paddingLeft: 18,
                        color: "var(--text-secondary)",
                        fontSize: 12,
                      }}
                    >
                      {m.demands.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>

            {session.competency && Object.keys(session.competency).length > 0 ? (
              <CompetencyPanel competency={session.competency} />
            ) : null}

            {choices.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {choices.map((c) => (
                  <Button
                    key={c.id}
                    variant={c.id === "approve_all" ? "secondary" : "primary"}
                    size="md"
                    type="button"
                    disabled={decideMut.isPending}
                    onClick={() => decideMut.mutate(c.id)}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                Scenario complete. Start a new session to practice again.
              </p>
            )}
            {decideMut.isError ? (
              <p style={{ marginTop: 12, color: "var(--red)", fontSize: 12 }}>
                Decision failed — try again or start a new session.
              </p>
            ) : null}
          </section>

          {showEngineRoom ? (
            <aside style={panel} aria-label="Engine room">
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "var(--amber)",
                  marginBottom: 10,
                }}
              >
                ENGINE ROOM · DEV
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-secondary)" }}>
                Live session state and last harness result — architecture visibility while testing.
              </p>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  maxHeight: 480,
                  overflow: "auto",
                  fontSize: 11,
                  lineHeight: 1.45,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text-secondary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(
                  {
                    id: session.id,
                    org_id: session.org_id,
                    stage: session.stage,
                    risk: session.risk,
                    last_harness: session.state?.last_harness ?? null,
                    decisions: session.state?.decisions ?? [],
                  },
                  null,
                  2,
                )}
              </pre>
            </aside>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
