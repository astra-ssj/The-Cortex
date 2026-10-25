import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { LogoIcon, LogoWordmark } from "../components/Logo";
import {
  completeDiagnosticAttempt,
  createDiagnosticAttempt,
  skipDiagnostic,
  type DiagnosticAttempt,
  type DiagnosticResponse,
} from "../api/learnerJourney";

export default function Onboarding() {
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<DiagnosticAttempt | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<DiagnosticResponse[]>([]);
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipRationale, setSkipRationale] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const skipRef = useRef<HTMLTextAreaElement>(null);

  const create = useMutation({
    mutationFn: createDiagnosticAttempt,
    onSuccess: setAttempt,
  });
  const complete = useMutation({
    mutationFn: (items: DiagnosticResponse[]) =>
      completeDiagnosticAttempt(attempt!.id, items),
    onSuccess: (result) => {
      markOnboardingComplete();
      setAttempt(result);
    },
  });
  const skip = useMutation({
    mutationFn: skipDiagnostic,
    onSuccess: () => {
      markOnboardingComplete();
      navigate("/practices", { replace: true });
    },
  });

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      jurisdiction: "internal",
      purpose_tags: ["learning", "onboarding"],
      role: String(data.get("role") ?? ""),
      experience_level: String(data.get("experience")) as "new" | "developing" | "experienced",
      target_framework: String(data.get("framework") ?? ""),
      learning_goal: String(data.get("goal") ?? ""),
    });
  };

  const submitAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!attempt) return;
    const question = attempt.questions[questionIndex];
    if (!question) return;
    const data = new FormData(event.currentTarget);
    const next = [
      ...responses,
      {
        jurisdiction: "internal",
        purpose_tags: ["learning", "onboarding", "assessment"],
        question_id: question.id,
        response: String(data.get("response") ?? ""),
        rationale: String(data.get("rationale") ?? ""),
        confidence: Number(data.get("confidence")),
      },
    ];
    setResponses(next);
    if (questionIndex === attempt.questions.length - 1) complete.mutate(next);
    else setQuestionIndex((value) => value + 1);
  };

  const finished = attempt?.status === "completed";

  useEffect(() => {
    if (attempt) headingRef.current?.focus();
  }, [attempt, questionIndex]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 620,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 30,
          boxShadow: "var(--shadow-drop-lg)",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <LogoIcon size={48} glow />
          <LogoWordmark fontSize={24} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "2px",
              color: "var(--cyan)",
            }}
          >
            Community Edition
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 16,
              color: "var(--text-secondary)",
              textAlign: "center",
            }}
          >
            Competence you can evidence.
          </span>
        </div>

        <div aria-live="polite">
          <h1 ref={headingRef} tabIndex={-1} style={{ margin: "0 0 10px", fontSize: 22, color: "var(--text)" }}>
            {finished ? "Your learning plan is ready" : "Learner diagnostic"}
          </h1>
          <p style={{ margin: "0 0 24px", color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.5 }}>
            {attempt
              ? `Step ${Math.min(questionIndex + 2, 4)} of 4 · Your authored answer, rationale, and confidence are retained as assessment evidence.`
              : "Tell us where you are headed, then answer three short judgment prompts. Recommendations are deterministic and use published curriculum only."}
          </p>
        </div>

        {!attempt ? (
          <form onSubmit={submitProfile} style={formStyle}>
            <label style={labelStyle}>Current role<input name="role" required minLength={2} style={inputStyle} /></label>
            <label style={labelStyle}>Experience
              <select name="experience" style={inputStyle} defaultValue="new">
                <option value="new">New to GRC</option>
                <option value="developing">Developing practitioner</option>
                <option value="experienced">Experienced practitioner</option>
              </select>
            </label>
            <label style={labelStyle}>Target framework
              <select name="framework" style={inputStyle} defaultValue="iso27001-2022">
                <option value="iso27001-2022">ISO 27001:2022</option>
                <option value="nist-csf-2.0">NIST CSF 2.0</option>
                <option value="iso42001">ISO 42001</option>
                <option value="soc2">SOC 2</option>
              </select>
            </label>
            <label style={labelStyle}>Learning goal<textarea name="goal" required minLength={5} rows={3} style={inputStyle} /></label>
            <button type="submit" disabled={create.isPending} aria-busy={create.isPending} style={buttonStyle}>Continue →</button>
          </form>
        ) : finished ? (
          <div>
            <p style={{ color: "var(--text)", lineHeight: 1.6 }}>
              {attempt.recommendation?.rationale}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>
              Recommendation confidence: {Math.round((attempt.recommendation?.confidence ?? 0) * 100)}%
            </p>
            <button type="button" onClick={() => navigate("/practices", { replace: true })} style={buttonStyle}>
              Open recommended practices →
            </button>
          </div>
        ) : (
          <form key={questionIndex} onSubmit={submitAnswer} style={formStyle}>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ color: "var(--text)", fontWeight: 700, lineHeight: 1.5 }}>
                {attempt.questions[questionIndex]?.prompt}
              </legend>
              <label style={labelStyle}>Your response<textarea name="response" required minLength={20} rows={4} style={inputStyle} /></label>
              <label style={labelStyle}>Why is this your approach?<textarea name="rationale" required minLength={10} rows={3} style={inputStyle} /></label>
              <label style={labelStyle}>Confidence: 0 (uncertain) to 1 (certain)
                <input name="confidence" type="number" required min={0} max={1} step={0.05} defaultValue={0.7} style={inputStyle} />
              </label>
            </fieldset>
            <button type="submit" disabled={complete.isPending} aria-busy={complete.isPending} style={buttonStyle}>
              {questionIndex === attempt.questions.length - 1 ? "Build my plan" : "Next question →"}
            </button>
          </form>
        )}

        {!finished ? (
          <div style={{ marginTop: 18 }}>
            {!skipOpen ? (
              <button type="button" onClick={() => { setSkipOpen(true); window.requestAnimationFrame(() => skipRef.current?.focus()); }} style={linkButtonStyle}>Skip diagnostic</button>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); skip.mutate(skipRationale); }} style={formStyle}>
                <label style={labelStyle}>Why are you skipping?
                  <textarea ref={skipRef} value={skipRationale} onChange={(event) => setSkipRationale(event.target.value)} required minLength={10} rows={2} style={inputStyle} />
                </label>
                <button type="submit" disabled={skip.isPending} style={linkButtonStyle}>Confirm audited skip</button>
              </form>
            )}
          </div>
        ) : null}
        {(create.isError || complete.isError || skip.isError) ? (
          <p role="alert" style={{ color: "var(--red)", fontSize: 12 }}>The diagnostic could not be saved. Review your answers and try again.</p>
        ) : null}
        <span role="status" aria-live="polite" className="sr-only">
          {create.isPending || complete.isPending || skip.isPending ? "Saving diagnostic" : ""}
        </span>
      </div>
    </main>
  );
}

const buttonStyle: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  background: "var(--blue)",
  border: "none",
  color: "var(--on-accent)",
  fontSize: 14,
  fontWeight: "bold",
  cursor: "pointer",
};

const formStyle: CSSProperties = { display: "grid", gap: 16, textAlign: "left" };
const labelStyle: CSSProperties = { display: "grid", gap: 6, color: "var(--text-secondary)", fontSize: 12 };
const inputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 6,
  border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
};
const linkButtonStyle: CSSProperties = {
  border: 0, background: "transparent", color: "var(--text-secondary)",
  textDecoration: "underline", cursor: "pointer", fontSize: 12,
};

function markOnboardingComplete(): void {
  try {
    const raw = window.localStorage.getItem("cortex_user");
    if (!raw) return;
    const user = JSON.parse(raw) as Record<string, unknown>;
    window.localStorage.setItem(
      "cortex_user",
      JSON.stringify({ ...user, onboarding_complete: true, onboarding_step: 3 }),
    );
  } catch {
    // A malformed auth cache is handled by the normal auth-expiry path.
  }
}
