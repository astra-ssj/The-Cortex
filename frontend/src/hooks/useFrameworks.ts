import { useQuery } from "@tanstack/react-query";
import {
  fetchFramework,
  fetchFrameworkControls,
  fetchFrameworks,
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
    queryFn: fetchFrameworks,
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
