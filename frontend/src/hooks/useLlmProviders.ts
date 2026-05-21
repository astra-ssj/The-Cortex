import { useQuery } from "@tanstack/react-query";

import { systemApi, type LlmPlatformStatusResponse } from "../api/client";

export type LlmProviderStatus = {
  provider?: string;
  configured?: boolean;
  model?: string;
  api_key_set?: boolean;
};

export type LlmPlatformStatus = LlmPlatformStatusResponse;

/** Primary provider used for ingest (first in active_chain, else stub). */
export function primaryIngestProvider(status: LlmPlatformStatus | undefined): string {
  const active = status?.active_chain ?? [];
  if (active.length > 0) return active[0] ?? "stub";
  return "stub";
}

export function useLlmProviders() {
  return useQuery({
    queryKey: ["system", "llm-providers"],
    queryFn: () => systemApi.getLlmProviders(),
    staleTime: 120_000,
    retry: 1,
  });
}
