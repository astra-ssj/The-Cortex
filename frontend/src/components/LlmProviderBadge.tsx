import { Badge } from "./ui/Badge";
import { isFeatureEnabled } from "../lib/featureFlags";
import { primaryIngestProvider, useLlmProviders } from "../hooks/useLlmProviders";

const LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  stub: "Stub (offline)",
};

function labelFor(id: string): string {
  return LABELS[id] ?? id;
}

/** Shows active LLM provider for ingest and assessment (same provider chain). */
export function LlmProviderBadge() {
  const ingestLive = isFeatureEnabled("evidenceIngestLive");
  const assessLive = isFeatureEnabled("assessmentLlmLive");
  if (!ingestLive && !assessLive) return null;

  const { data, isLoading, isError } = useLlmProviders();
  if (isError) return null;

  const providerId = isLoading ? "…" : primaryIngestProvider(data);
  const variant = providerId === "stub" ? "neutral" : "purple";
  const assessOff = data?.assessment_llm_enabled === false;

  const label =
    ingestLive && assessLive
      ? `LLM: ${labelFor(providerId)}`
      : ingestLive
        ? `Ingest: ${labelFor(providerId)}`
        : `Assess: ${labelFor(providerId)}`;

  return (
    <Badge
      variant={variant}
      size="xs"
      title={
        data
          ? `Chain: ${data.active_chain.join(" → ")}${assessOff ? " · assessment LLM disabled" : ""}`
          : "Ingest and assessments use the configured LLM provider chain"
      }
    >
      {label}
    </Badge>
  );
}
