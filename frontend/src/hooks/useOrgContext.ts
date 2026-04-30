import { useState, useCallback, useEffect } from "react";

const DEMO_ORG = "demo-org-001";
const DEMO_MODE_KEY = "cortex_demo_mode";
const ORG_ID_KEY = "cortex_org_id";

export interface OrgContext {
  orgId: string;
  demoMode: boolean;
  toggleDemoMode: () => void;
  isOwnData: boolean;
  isDemoOrg: boolean;
}

export function useOrgContext(): OrgContext {
  const getStoredOrgId = () => localStorage.getItem(ORG_ID_KEY) ?? DEMO_ORG;

  const getStoredDemoMode = () => {
    const orgId = getStoredOrgId();
    if (orgId === DEMO_ORG) return true;
    return localStorage.getItem(DEMO_MODE_KEY) === "true";
  };

  const [orgId, setOrgId] = useState<string>(getStoredOrgId);
  const [demoMode, setDemoMode] = useState<boolean>(getStoredDemoMode);

  // Sync when localStorage changes from another component (e.g. login sets org_id)
  useEffect(() => {
    const handleStorage = () => {
      setOrgId(getStoredOrgId());
      setDemoMode(getStoredDemoMode());
    };
    window.addEventListener("storage", handleStorage);
    // Also listen to custom event for same-tab updates
    window.addEventListener("cortex-org-changed", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("cortex-org-changed", handleStorage);
    };
  }, []);

  const toggleDemoMode = useCallback(() => {
    setDemoMode((prev) => {
      const next = !prev;
      localStorage.setItem(DEMO_MODE_KEY, String(next));
      return next;
    });
    window.dispatchEvent(new Event("cortex-org-changed"));
  }, []);

  const effectiveOrgId = demoMode ? DEMO_ORG : orgId;

  return {
    orgId: effectiveOrgId,
    demoMode,
    toggleDemoMode,
    isOwnData: !demoMode && orgId !== DEMO_ORG,
    isDemoOrg: orgId === DEMO_ORG,
  };
}

// Call this after login/register to update all components using useOrgContext
export function setStoredOrgId(newOrgId: string) {
  localStorage.setItem(ORG_ID_KEY, newOrgId);
  if (newOrgId === DEMO_ORG) {
    localStorage.setItem(DEMO_MODE_KEY, "true");
  } else {
    localStorage.setItem(DEMO_MODE_KEY, "false");
  }
  // Notify same-tab listeners
  window.dispatchEvent(new Event("cortex-org-changed"));
}
