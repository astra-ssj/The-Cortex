import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export function useFilterParams<K extends string>(
  defaults: Record<K, string>,
): [Record<K, string>, (updates: Partial<Record<K, string>>) => void] {
  const location = useLocation();
  const navigate = useNavigate();

  const params = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const next = {} as Record<K, string>;

    for (const key of Object.keys(defaults) as K[]) {
      const value = searchParams.get(key);
      next[key] = value && value.length > 0 ? value : defaults[key];
    }

    return next;
  }, [defaults, location.search]);

  const setParams = useCallback(
    (updates: Partial<Record<K, string>>) => {
      const nextSearch = new URLSearchParams(location.search);

      for (const key of Object.keys(updates) as K[]) {
        const value = updates[key];
        if (value == null || value === defaults[key]) {
          nextSearch.delete(key);
        } else {
          nextSearch.set(key, value);
        }
      }

      const search = nextSearch.toString();
      navigate(
        {
          pathname: location.pathname,
          search: search ? `?${search}` : "",
        },
        { replace: true },
      );
    },
    [defaults, location.pathname, location.search, navigate],
  );

  return [params, setParams];
}
