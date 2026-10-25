import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { fetchApi } from "../api/client";
import { Button } from "../components/ui/Button";

interface ScenarioDraft {
  scenario: Record<string, unknown>;
  published: boolean;
  provider: string;
  model: string;
  mode: string;
}

export default function ScenarioStudio() {
  const [brief, setBrief] = useState("");
  const [framework, setFramework] = useState("iso27001");
  const draft = useMutation({
    mutationFn: () =>
      fetchApi<ScenarioDraft>("/api/v1/curriculum/scenario-drafts", {
        method: "POST",
        body: JSON.stringify({
          jurisdiction: "internal",
          purpose_tags: ["learning", "curriculum-authoring"],
          brief,
          framework,
        }),
      }),
  });
  const scenario = draft.data?.scenario;

  return (
    <div style={{ paddingTop: 8, maxWidth: 860 }}>
      <h1 style={{ margin: "6px 0 8px", fontSize: 24 }}>Author a customer scenario</h1>
      <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
        Describe the situation. Astra drafts an unpublished practice. A local Gemma model is used when Ollama is configured; otherwise the draft is a deterministic scaffold. Nothing is added to the learner catalogue until it passes curriculum review.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          draft.mutate();
        }}
        style={{ display: "grid", gap: 12, marginTop: 18 }}
      >
        <label htmlFor="scenario-brief">Situation</label>
        <textarea
          id="scenario-brief"
          required
          minLength={20}
          rows={5}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)" }}
        />
        <label htmlFor="scenario-framework">Framework</label>
        <select id="scenario-framework" value={framework} onChange={(event) => setFramework(event.target.value)} style={{ padding: 8 }}>
          <option value="iso27001">ISO 27001</option>
          <option value="nist-csf">NIST CSF</option>
          <option value="gdpr">GDPR</option>
          <option value="dora">DORA</option>
        </select>
        <Button type="submit" disabled={draft.isPending}>{draft.isPending ? "Drafting…" : "Draft scenario"}</Button>
      </form>
      {draft.isError ? <p role="alert">The draft could not be created. Check the situation and try again.</p> : null}
      {draft.data ? (
        <section aria-label="Unpublished scenario draft" style={{ marginTop: 22 }}>
          <p>
            {draft.data.mode === "local_model" ? "Drafted with the local model" : "Deterministic scaffold"} · {draft.data.provider} / {draft.data.model}. This draft is not published.
          </p>
          <pre style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>
            {JSON.stringify(scenario, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
