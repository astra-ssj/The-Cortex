/**
 * Single source for framework API ids ↔ display labels used in Review / Remediation filters.
 * Order matches assessment bundle sent with ALL_FRAMEWORK_IDS — keep aligned with backend registry.
 */

export const FRAMEWORK_IDS_ORDERED = [
  "iso27001-2022",
  "gdpr-2016-679",
  "nis2-2022-2555",
  "nist-csf-2.0",
  "csa-ccm-v4",
  "cyber-essentials-v3.1",
  "eu-ai-act-2024",
  "eu-cybersecurity-act",
] as const;

export type FrameworkApiId = (typeof FRAMEWORK_IDS_ORDERED)[number];

const LABEL_BY_ID: Record<FrameworkApiId, string> = {
  "iso27001-2022": "ISO/IEC 27001:2022",
  "gdpr-2016-679": "GDPR 2016/679",
  "nis2-2022-2555": "NIS2 Directive",
  "nist-csf-2.0": "NIST CSF 2.0",
  "csa-ccm-v4": "CSA CCM v4",
  "cyber-essentials-v3.1": "Cyber Essentials v3.1",
  "eu-ai-act-2024": "EU AI Act 2024",
  "eu-cybersecurity-act": "EU Cybersecurity Act",
};

/** Comma-separated list for assessment streams and API defaults — derived so ids stay in one place. */
export const ALL_FRAMEWORK_IDS = FRAMEWORK_IDS_ORDERED.join(",");

export function frameworkLabelFromId(id: string): string {
  for (const fid of FRAMEWORK_IDS_ORDERED) {
    if (fid === id) return LABEL_BY_ID[fid];
  }
  return id;
}

/** Map Human Review / Remediation filter label → API framework id (undefined if not a known label). */
export function frameworkIdFromFilterLabel(label: string): FrameworkApiId | undefined {
  for (const fid of FRAMEWORK_IDS_ORDERED) {
    if (LABEL_BY_ID[fid] === label) return fid;
  }
  return undefined;
}

const FRAMEWORK_LABELS_IN_ORDER: readonly string[] = FRAMEWORK_IDS_ORDERED.map((fid) => LABEL_BY_ID[fid]);

/** Filter dropdown values: All + canonical labels in assessment order. */
export const FRAMEWORK_FILTER_OPTIONS = ["All", ...FRAMEWORK_LABELS_IN_ORDER] as const;

export type FrameworkFilterOption = (typeof FRAMEWORK_FILTER_OPTIONS)[number];
