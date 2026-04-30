import { useSyncExternalStore } from "react";

const DEMO_ORG = "demo-org-001";
const DEMO_MODE_KEY = "cortex_demo_mode";
const ORG_ID_KEY = "cortex_org_id";
const ORG_CONTEXT_EVENT = "cortex:org-context-updated";

export interface OrgContext {
  orgId: string;
  demoMode: boolean;
  toggleDemoMode: () => void;
  isOwnData: boolean;
  isDemoOrg: boolean;
}

type OrgSnapshot = {
  storedOrgId: string;
  demoMode: boolean;
};

const listeners = new Set<() => void>();

function getSnapshot(): OrgSnapshot {
  const storedOrgId = localStorage.getItem(ORG_ID_KEY) ?? DEMO_ORG;
  const initialDemo =
    storedOrgId === DEMO_ORG ||
    localStorage.getItem(DEMO_MODE_KEY) === "true";
  return { storedOrgId, demoMode: initialDemo };
}

function getServerSnapshot(): OrgSnapshot {
  return { storedOrgId: DEMO_ORG, demoMode: true };
}

function emitContextChanged() {
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new CustomEvent(ORG_CONTEXT_EVENT));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ORG_ID_KEY || event.key === DEMO_MODE_KEY) {
      listener();
    }
  };
  const onLocalEvent = () => listener();
  window.addEventListener("storage", onStorage);
  window.addEventListener(ORG_CONTEXT_EVENT, onLocalEvent);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(ORG_CONTEXT_EVENT, onLocalEvent);
  };
}

export function useOrgContext(): OrgContext {
  const { storedOrgId, demoMode } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const effectiveOrgId = demoMode ? DEMO_ORG : storedOrgId;

  const toggleDemoMode = () => {
    const next = !demoMode;
    localStorage.setItem(DEMO_MODE_KEY, String(next));
    emitContextChanged();
  };

  return {
    orgId: effectiveOrgId,
    demoMode,
    toggleDemoMode,
    isOwnData: !demoMode && storedOrgId !== DEMO_ORG,
    isDemoOrg: storedOrgId === DEMO_ORG,
  };
}

// Helper — save org_id to localStorage after login
export function setStoredOrgId(orgId: string) {
  localStorage.setItem(ORG_ID_KEY, orgId);
  // If new org is demo, set demo mode on
  if (orgId === DEMO_ORG) {
    localStorage.setItem(DEMO_MODE_KEY, "true");
  }
  emitContextChanged();
}
