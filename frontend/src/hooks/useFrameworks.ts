import { useQuery } from "@tanstack/react-query";
import { getToken } from "../api/client";
import {
  fetchFramework,
  fetchFrameworkControls,
  fetchFrameworks,
  type FrameworkSummary,
} from "../api/frameworks";

export const frameworksQueryKey = ["frameworks"] as const;
export function frameworkQueryKey(id: string) {
  return ["frameworks", id] as const;
}
export function frameworkControlsQueryKey(id: string, page: number, pageSize: number) {
  return ["frameworks", id, "controls", page, pageSize] as const;
}

export function useFrameworks() {
  return useQuery({
    queryKey: frameworksQueryKey,
    queryFn: async (): Promise<FrameworkSummary[]> => {
      const page = await fetchFrameworks();
      const items = page.items;
      return Array.isArray(items) ? items : [];
    },
    enabled: Boolean(getToken()),
    retry: 1,
    staleTime: 60_000,
  });
}

export function useFramework(id: string | null) {
  return useQuery({
    queryKey: frameworkQueryKey(id ?? ""),
    queryFn: () => fetchFramework(id!),
    enabled: id != null && id !== "",
  });
}

export function useFrameworkControls(
  id: string | null,
  page: number = 1,
  pageSize: number = 20
) {
  return useQuery({
    queryKey: frameworkControlsQueryKey(id ?? "", page, pageSize),
    queryFn: () => fetchFrameworkControls(id!, page, pageSize),
    enabled: id != null && id !== "",
  });
}
