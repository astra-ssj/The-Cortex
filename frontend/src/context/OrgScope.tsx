import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const DEMO_ORG_ID = "demo-org-001";
const DEMO_MODE_KEY = "cortex_demo_mode";
const ORG_KEY = "cortex_org_id";

export interface OrgContextValue {
  orgId: string;
  demoMode: boolean;
  toggleDemoMode: () => void;
  isOwnData: boolean;
  isDemoOrg: boolean;
  setStoredOrgId: (id: string) => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

function readStoredOrgId(): string {
  if (typeof window === "undefined") return DEMO_ORG_ID;
  return localStorage.getItem(ORG_KEY) ?? DEMO_ORG_ID;
}

function readDemoModeFlag(storedOrg: string): boolean {
  if (typeof window === "undefined") return storedOrg === DEMO_ORG_ID;
  return storedOrg === DEMO_ORG_ID || localStorage.getItem(DEMO_MODE_KEY) === "true";
}

export function OrgScopeProvider({ children }: { children: ReactNode }) {
  const [storedOrgId, setStoredOrgIdState] = useState<string>(() => readStoredOrgId());
  const [demoMode, setDemoMode] = useState<boolean>(() => readDemoModeFlag(readStoredOrgId()));

  const setStoredOrgId = useCallback((id: string) => {
    localStorage.setItem(ORG_KEY, id);
    setStoredOrgIdState(id);
    setDemoMode(readDemoModeFlag(id));
  }, []);

  const toggleDemoMode = useCallback(() => {
    if (storedOrgId === DEMO_ORG_ID) return;
    setDemoMode((prev) => {
      const next = !prev;
      localStorage.setItem(DEMO_MODE_KEY, String(next));
      return next;
    });
  }, [storedOrgId]);

  const effectiveOrgId = demoMode ? DEMO_ORG_ID : storedOrgId;

  const value = useMemo<OrgContextValue>(
    () => ({
      orgId: effectiveOrgId,
      demoMode,
      toggleDemoMode,
      isOwnData: !demoMode && storedOrgId !== DEMO_ORG_ID,
      isDemoOrg: storedOrgId === DEMO_ORG_ID,
      setStoredOrgId,
    }),
    [demoMode, effectiveOrgId, storedOrgId, toggleDemoMode, setStoredOrgId]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrgContext(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error("useOrgContext must be used within OrgScopeProvider");
  }
  return ctx;
}
