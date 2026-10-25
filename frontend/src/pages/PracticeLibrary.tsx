import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { getPractices, type PracticeCatalogEntry } from "../api/practices";
import { getLearningPlan } from "../api/learnerJourney";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/Skeleton";
import { frameworkLabelFromId } from "../lib/frameworkRegistry";

const panel: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
};

const eyebrow: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

function dimensionLabel(dimension: string): string {
  if (dimension === "control_mapping") return "Control mapping";
  if (dimension === "evidence") return "Evidence quality";
  if (dimension === "escalation") return "Escalation judgment";
  if (dimension === "remediation") return "Remediation";
  return dimension;
}

function reviewLabel(practice: PracticeCatalogEntry): string {
  if (practice.review_state === "reviewed") return "SME reviewed";
  if (practice.review_state === "adapted") return "Adapted for training";
  return "Curriculum candidate";
}

function difficultyColor(difficulty: PracticeCatalogEntry["difficulty"]): string {
  if (difficulty === "foundation") return "var(--green)";
  if (difficulty === "practitioner") return "var(--amber)";
  return "var(--red)";
}

function practiceFrameworkLabel(framework: string): string {
  if (framework === "general") return "General GRC";
  if (framework === "iso27001") return "ISO 27001";
  if (framework === "iso27701") return "ISO 27701";
  if (framework === "iso42001") return "ISO 42001";
  if (framework === "soc2") return "SOC 2";
  if (framework === "nis2") return "NIS 2";
  if (framework === "dora") return "DORA";
  return frameworkLabelFromId(framework);
}

function PracticeMeta({ practice }: { practice: PracticeCatalogEntry }) {
  const color = difficultyColor(practice.difficulty);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" }}>
      <span
        style={{
          padding: "3px 8px",
          borderRadius: "var(--radius-sm)",
          background: "var(--blue-soft)",
          color: "var(--blue)",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {practice.category.replace(/-/g, " ")}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>
        {practice.difficulty}
      </span>
      <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
        {practice.estimated_minutes} min
      </span>
      <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
        {reviewLabel(practice)}
      </span>
    </div>
  );
}

function PracticeDetails({ practice }: { practice: PracticeCatalogEntry }) {
  return (
    <details style={{ marginTop: 16 }}>
      <summary
        style={{
          cursor: "pointer",
          color: "var(--blue)",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        Learning objectives and provenance
      </summary>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 18,
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <div>
          <div style={{ ...eyebrow, marginBottom: 8 }}>You will practice</div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: "var(--text-secondary)",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {practice.learning_objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        </div>
        <div>
          <div style={{ ...eyebrow, marginBottom: 8 }}>Trust and provenance</div>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "86px 1fr",
              gap: "6px 10px",
              margin: 0,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            <dt style={{ color: "var(--text-tertiary)" }}>Source</dt>
            <dd style={{ margin: 0, color: "var(--text)" }}>Better ISMS</dd>
            <dt style={{ color: "var(--text-tertiary)" }}>Release</dt>
            <dd style={{ margin: 0, color: "var(--text)" }}>{practice.source_release}</dd>
            <dt style={{ color: "var(--text-tertiary)" }}>License</dt>
            <dd style={{ margin: 0, color: "var(--text)" }}>{practice.license}</dd>
            <dt style={{ color: "var(--text-tertiary)" }}>Authority</dt>
            <dd style={{ margin: 0, color: "var(--text)" }}>
              Training only; no external action
            </dd>
          </dl>
        </div>
      </div>
    </details>
  );
}

function ReadyPractice({
  practice,
  onStart,
  recommended,
}: {
  practice: PracticeCatalogEntry;
  onStart: (practice: PracticeCatalogEntry) => void;
  recommended: boolean;
}) {
  return (
    <article
      aria-label={`${practice.title}, ready to start`}
      style={{ ...panel, padding: 22, borderTop: "3px solid var(--blue)" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 18,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 420px" }}>
          <PracticeMeta practice={practice} />
          {recommended ? (
            <div role="status" style={{ ...eyebrow, color: "var(--green)", marginTop: 10 }}>
              Recommended for your learning plan
            </div>
          ) : null}
          <h2 style={{ margin: "12px 0 8px", color: "var(--text)", fontSize: 19 }}>
            {practice.title}
          </h2>
          <p
            style={{
              margin: 0,
              maxWidth: 680,
              color: "var(--text-secondary)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {practice.summary}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
            {practice.frameworks.map((framework) => (
              <span
                key={framework}
                style={{
                  padding: "3px 7px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                }}
              >
                {practiceFrameworkLabel(framework)}
              </span>
            ))}
          </div>
        </div>
        <div style={{ minWidth: 170 }}>
          <div style={{ ...eyebrow, marginBottom: 8 }}>Competency focus</div>
          {practice.target_dimensions.map((dimension) => (
            <div
              key={dimension}
              style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 5 }}
            >
              {dimensionLabel(dimension)}
            </div>
          ))}
          <Button
            variant="primary"
            size="lg"
            style={{ marginTop: 12, width: "100%" }}
            onClick={() => onStart(practice)}
          >
            Start practice
          </Button>
        </div>
      </div>
      <PracticeDetails practice={practice} />
    </article>
  );
}

function PlannedPractice({ practice }: { practice: PracticeCatalogEntry }) {
  return (
    <article
      aria-label={`${practice.title}, planned`}
      style={{
        padding: "16px 0",
        borderTop: "1px solid var(--border-subtle)",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 16,
        alignItems: "center",
      }}
    >
      <div>
        <PracticeMeta practice={practice} />
        <h3 style={{ margin: "9px 0 5px", fontSize: 15, color: "var(--text)" }}>
          {practice.title}
        </h3>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5 }}>
          {practice.summary}
        </p>
      </div>
      <span
        style={{
          padding: "5px 9px",
          borderRadius: "var(--radius-sm)",
          background: "var(--elevated)",
          color: "var(--text-secondary)",
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        Planned
      </span>
    </article>
  );
}

export default function PracticeLibrary() {
  const navigate = useNavigate();
  const [framework, setFramework] = useState("all");
  const [category, setCategory] = useState("all");
  const query = useQuery({ queryKey: ["practice-catalog"], queryFn: getPractices });
  const planQuery = useQuery({ queryKey: ["learning-plan"], queryFn: getLearningPlan });

  const practices = query.data ?? [];
  const frameworks = useMemo(
    () => Array.from(new Set(practices.flatMap((practice) => practice.frameworks))).sort(),
    [practices],
  );
  const categories = useMemo(
    () => Array.from(new Set(practices.map((practice) => practice.category))).sort(),
    [practices],
  );
  const filtered = practices.filter(
    (practice) =>
      (framework === "all" || practice.frameworks.includes(framework)) &&
      (category === "all" || practice.category === category),
  );
  const recommendedIds = new Set(
    (planQuery.data?.practices ?? [])
      .filter((practice) => practice.recommended)
      .map((practice) => practice.practice_id),
  );
  const ready = filtered
    .filter((practice) => practice.status === "available")
    .sort((a, b) => Number(recommendedIds.has(b.id)) - Number(recommendedIds.has(a.id)));
  const planned = filtered.filter((practice) => practice.status === "planned");

  const onStart = (practice: PracticeCatalogEntry) => {
    if (!practice.scenario_slug) return;
    const params = new URLSearchParams({
      scenario: practice.scenario_slug,
      practice: practice.id,
    });
    navigate(`/learning?${params.toString()}`);
  };

  return (
    <div style={{ paddingTop: 8, maxWidth: 1120 }}>
      <div style={eyebrow}>TRAIN</div>
      <h1 style={{ margin: "6px 0 0", fontSize: 24, color: "var(--text)" }}>
        Practice Library
      </h1>
      <p
        style={{
          margin: "8px 0 24px",
          maxWidth: 700,
          color: "var(--text-secondary)",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        Build demonstrated GRC judgment through source-traceable exercises. Practices use
        simulated records and decisions; they never act on organizational systems.
      </p>

      <fieldset
        style={{
          ...panel,
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          padding: 16,
          marginBottom: 22,
        }}
      >
        <legend className="sr-only">Practice filters</legend>
        <label style={{ display: "grid", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
          Framework
          <select
            value={framework}
            onChange={(event) => setFramework(event.target.value)}
            style={{
              minWidth: 190,
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          >
            <option value="all">All frameworks</option>
            {frameworks.map((item) => (
              <option key={item} value={item}>
                {practiceFrameworkLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
          Practice area
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            style={{
              minWidth: 190,
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          >
            <option value="all">All practice areas</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item.replace(/-/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {Array.isArray(planQuery.data?.tracks) && planQuery.data.tracks.length ? (
        <section aria-label="Learning tracks" style={{ ...panel, padding: 16, marginBottom: 22 }}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Your learning tracks</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {planQuery.data.tracks.map((track) => (
              <span key={track.track_version_id} style={{ padding: "6px 9px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--text)" }}>
                {track.title} · v{track.version} · {track.completed ? "complete" : track.locked ? "locked" : "available"}
                {track.recommended ? " · recommended" : ""}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div aria-live="polite" aria-busy={query.isPending}>
      {query.isPending ? (
        <div role="status" aria-label="Loading practices" style={{ ...panel, padding: 22 }}>
          <Skeleton height="18px" width="38%" style={{ marginBottom: 14 }} />
          <Skeleton height="72px" style={{ marginBottom: 14 }} />
          <Skeleton height="38px" width="160px" />
        </div>
      ) : query.isError ? (
        <EmptyState
          icon="!"
          title="Practice catalogue unavailable"
          description="The curriculum catalogue could not be loaded. Check your connection and try again."
          badge="TRAIN"
          badgeColor="var(--amber)"
          cta="Retry"
          onCta={() => {
            void query.refetch();
          }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="○"
          title="No matching practices"
          description="Change the framework or practice-area filter to see other exercises."
          badge="FILTERED"
          badgeColor="var(--blue)"
        />
      ) : (
        <>
          {ready.length > 0 ? (
            <section aria-labelledby="ready-practices">
              <h2 id="ready-practices" style={{ ...eyebrow, marginBottom: 10 }}>
                Ready now
              </h2>
              <div style={{ display: "grid", gap: 14 }}>
                {ready.map((practice) => (
                  <ReadyPractice
                    key={practice.id}
                    practice={practice}
                    onStart={onStart}
                    recommended={recommendedIds.has(practice.id)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {planned.length > 0 ? (
            <section
              aria-labelledby="planned-practices"
              style={{ ...panel, marginTop: 24, padding: "18px 20px 4px" }}
            >
              <h2 id="planned-practices" style={{ ...eyebrow, marginBottom: 8 }}>
                Curriculum roadmap
              </h2>
              {planned.map((practice) => (
                <PlannedPractice key={practice.id} practice={practice} />
              ))}
            </section>
          ) : null}
        </>
      )}
      </div>
    </div>
  );
}
