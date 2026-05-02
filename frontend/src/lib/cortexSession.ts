/**
 * Browser session keys for CORTEX auth and onboarding.
 * Cleared together on logout and on auth expiry so the next visit starts clean.
 */

export const CORTEX_STORAGE_KEYS = [
  "cortex_token",
  "cortex_user",
  "cortex_org_id",
  "cortex_demo_mode",
  "cortex_jurisdiction",
  "cortex_onboarding",
  "cortex_company",
] as const;

export function clearCortexBrowserSession(): void {
  for (const key of CORTEX_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}
