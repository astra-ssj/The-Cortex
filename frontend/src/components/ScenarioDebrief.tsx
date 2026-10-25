/**
 * Post-scenario debrief.
 *
 * The rationale, the reference answers and the four dimension scores were all
 * computed and persisted by the loop already; before this screen existed the
 * session ended on "Scenario complete. Start a new session to practice again."
 * A learner who is never told what the right answer was has not been taught.
 *
 * The closing handoff is deliberate: it is the sentence that turns six separate
 * modules into one product by naming what the session just produced downstream.
 */

import { useEffect, useRef, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  type DebriefDecision,
  type DebriefDimension,
  type ScenarioDebriefData,
} from "../api/learning";
import { Button } from "./ui/Button";

const panel: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-5)",
};

const eyebrow: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

function scoreColor(score: number, isGap: boolean): string {
  if (isGap) return "var(--red)";
  if (score >= 70) return "var(--green)";
  return "var(--amber)";
}

function stageLabel(stage: string): string {
  return stage.replace(/_/g, " ");
}

function ControlChips({ controls }: { controls: string[] }) {
  if (controls.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      {controls.map((c) => (
        <span
          key={c}
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--cyan)",
            background: "color-mix(in srgb, var(--cyan) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--cyan) 35%, transparent)",
            borderRadius: 4,
            padding: "2px 8px",
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function DimensionCard({ dim }: { dim: DebriefDimension }) {
  const score = Math.max(0, Math.min(100, Number(dim.score) || 0));
  const color = scoreColor(score, dim.is_gap);
  return (
    <div
      style={{
        background: "var(--card)",
        border: `1px solid ${dim.is_gap ? "color-mix(in srgb, var(--red) 40%, transparent)" : "var(--border)"}`,
        borderRadius: 8,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <span style={{ ...eyebrow, letterSpacing: "0.06em" }}>{dim.label}</span>
        <span style={{ fontSize: 18, fontWeight: 700, color }}>{score}</span>
      </div>
      <div
        style={{
          marginTop: 10,
          height: 5,
          borderRadius: 3,
          background: "var(--border)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${score}%`, height: "100%", background: color }} />
      </div>
      {dim.is_gap ? (
        <p style={{ margin: "10px 0 0", fontSize: 11, fontWeight: 700, color: "var(--red)" }}>
          Below the competency floor — recommended for more practice
        </p>
      ) : null}
      {dim.observations.length > 0 ? (
        <p style={{ margin: "8px 0 0", fontSize: 11, lineHeight: 1.5, color: "var(--text-secondary)" }}>
          {dim.observations[dim.observations.length - 1]}
        </p>
      ) : null}
    </div>
  );
}

function DecisionCard({ decision }: { decision: DebriefDecision }) {
  const ok = decision.correct;
  const accent = ok ? "var(--green)" : "var(--red)";
  return (
    <article
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 8,
        padding: 16,
      }}
      aria-label={`Decision ${decision.sequence}`}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <span style={eyebrow}>
          Decision {decision.sequence} · {stageLabel(decision.stage)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: accent }}>
          {ok ? "✓ MATCHED REFERENCE" : "✗ MISSED"}
        </span>
      </div>

      <dl style={{ margin: 0, display: "grid", gap: 10 }}>
        <div>
          <dt style={{ ...eyebrow, fontSize: 10, marginBottom: 3 }}>You chose</dt>
          <dd style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            {decision.chosen_label}
          </dd>
        </div>

        {!ok && decision.reference_label ? (
          <div>
            <dt style={{ ...eyebrow, fontSize: 10, marginBottom: 3, color: "var(--green)" }}>
              Reference answer
            </dt>
            <dd style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--green)" }}>
              {decision.reference_label}
            </dd>
          </div>
        ) : null}
      </dl>

      {decision.learner_rationale ? (
        <p style={{ margin: "12px 0 0", fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)" }}>
          <strong style={{ color: "var(--text)" }}>Your rationale: </strong>
          {decision.learner_rationale}
          {decision.learner_confidence != null
            ? ` · Confidence ${Math.round(decision.learner_confidence * 100)}%`
            : ""}
        </p>
      ) : null}

      {decision.framework_rationale ? (
        <p
          style={{
            margin: "14px 0 0",
            padding: 12,
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--text)",
            background: "var(--bg)",
            borderRadius: 6,
          }}
        >
          {decision.framework_rationale}
        </p>
      ) : null}

      {!ok && decision.reference_rationale &&
      decision.reference_rationale !== decision.framework_rationale ? (
        <p
          style={{
            margin: "10px 0 0",
            padding: 12,
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            background: "color-mix(in srgb, var(--green) 7%, transparent)",
            borderLeft: "2px solid color-mix(in srgb, var(--green) 50%, transparent)",
            borderRadius: 4,
          }}
        >
          <strong style={{ color: "var(--green)" }}>Why that was correct: </strong>
          {decision.reference_rationale}
        </p>
      ) : null}

      {decision.consequence ? (
        <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)" }}>
          <strong style={{ color: "var(--text)" }}>Consequence: </strong>
          {decision.consequence}
        </p>
      ) : null}

      <ControlChips controls={decision.controls} />
    </article>
  );
}

export function ScenarioDebrief({
  debrief,
  onRestart,
}: {
  debrief: ScenarioDebriefData;
  onRestart: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const { decision_count: total, correct_count: correct } = debrief;
  const gapLabels = debrief.competency
    .filter((d) => d.is_gap)
    .map((d) => d.label);

  return (
    <section style={panel} aria-label="Scenario debrief">
      <div style={eyebrow}>Debrief</div>
      <h2 ref={headingRef} tabIndex={-1} style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, color: "var(--text)" }}>
        {debrief.scenario_title}
      </h2>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
        {correct} of {total} {total === 1 ? "decision" : "decisions"} matched the reference
        answer. Final scenario outcome:{" "}
        <strong style={{ color: "var(--text)" }}>{debrief.risk ?? "unknown"}</strong>.
      </p>

      {debrief.source_skill_id ? (
        <div
          style={{
            marginTop: 18,
            padding: 14,
            background: "var(--bg)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
          }}
        >
          <div>
            <div style={{ ...eyebrow, marginBottom: 7 }}>Method practiced</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              {debrief.source_skill_id.replace(/-/g, " ")}
            </div>
            <div style={{ marginTop: 5, fontSize: 11, color: "var(--text-secondary)" }}>
              Better ISMS · {debrief.source_skill_version ?? "version unavailable"} ·{" "}
              {debrief.source_skill_license ?? "license unavailable"}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-tertiary)" }}>
              {debrief.source_review_state === "reviewed"
                ? "SME reviewed"
                : "Adapted for training"}
              {debrief.source_skill_hash
                ? ` · source ${debrief.source_skill_hash.slice(0, 10)}`
                : ""}
            </div>
          </div>
          {debrief.learning_objectives && debrief.learning_objectives.length > 0 ? (
            <div>
              <div style={{ ...eyebrow, marginBottom: 7 }}>Learning objectives</div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  lineHeight: 1.55,
                }}
              >
                {debrief.learning_objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--text-tertiary)" }}>
        Scenario version {debrief.scenario_version ?? "unavailable"}
        {debrief.scenario_content_hash
          ? ` · content ${debrief.scenario_content_hash.slice(0, 12)}`
          : ""}
      </p>
      {debrief.agent_provenance?.length ? (
        <div aria-label="Agent response provenance" style={{ marginTop: 8, fontSize: 11, color: "var(--text-tertiary)" }}>
          {debrief.agent_provenance.map((item, index) => (
            <div key={`${item.type}-${index}`}>
              Turn {index + 1}: {item.type.replace(/_/g, " ")} · {item.provider} / {item.model}
            </div>
          ))}
        </div>
      ) : null}

      <h3 style={{ ...eyebrow, margin: "28px 0 12px" }}>Competency after this session</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {debrief.competency.map((dim) => (
          <DimensionCard key={dim.dimension} dim={dim} />
        ))}
      </div>

      <h3 style={{ ...eyebrow, margin: "28px 0 12px" }}>Decision review</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {debrief.decisions.map((d) => (
          <DecisionCard key={d.sequence} decision={d} />
        ))}
      </div>

      {debrief.controls_touched.length > 0 ? (
        <>
          <h3 style={{ ...eyebrow, margin: "28px 0 10px" }}>ISO 27001:2022 controls exercised</h3>
          <ControlChips controls={debrief.controls_touched} />
        </>
      ) : null}

      {/* The handoff. Without this the modules are six unrelated screens. */}
      <div
        style={{
          marginTop: 28,
          padding: 18,
          background: "color-mix(in srgb, var(--cyan) 8%, transparent)",
          borderLeft: "3px solid var(--cyan)",
          borderRadius: 4,
        }}
      >
        <div style={{ ...eyebrow, color: "var(--cyan)", marginBottom: 8 }}>What happens next</div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--text)" }}>
          {gapLabels.length > 0 ? (
            <>
              Your weakest {gapLabels.length === 1 ? "dimension" : "dimensions"} —{" "}
              <strong>{gapLabels.join(" and ")}</strong> — {gapLabels.length === 1 ? "is" : "are"}{" "}
              now prioritised for more practice. Strengthen {gapLabels.length === 1 ? "it" : "them"} by
              retaking this scenario or choosing another practice that exercises the same skills.
            </>
          ) : (
            <>
              Every dimension is at or above the competency floor. Continue with another practice
              or review your progress over time.
            </>
          )} Your completed session is recorded in your learning history.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          <Link to="/progress" className="cortex-action-link cortex-action-link-primary">
            View progress
          </Link>
          <Link to="/practices" className="cortex-action-link">
            Choose another practice
          </Link>
          <Button variant="secondary" size="md" type="button" onClick={onRestart}>
            Next scenario
          </Button>
        </div>
      </div>
    </section>
  );
}
