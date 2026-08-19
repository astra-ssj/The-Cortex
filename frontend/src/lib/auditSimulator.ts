/** Shared Audit Simulator labels — never include certification body names. */

export const AUDIT_FRAMEWORKS = [
  { slug: "iso27001-2022", label: "ISO 27001:2022", enabled: true },
  { slug: "gdpr-2016-679", label: "GDPR", enabled: true },
  { slug: "soc2", label: "SOC 2", enabled: false },
] as const;

export type AuditFrameworkSlug = (typeof AUDIT_FRAMEWORKS)[number]["slug"];

export const AUDIT_TYPES = [
  { id: "new_audit", label: "New Audit" },
  { id: "routine_inspection", label: "Routine Inspection" },
  { id: "post_incident_review", label: "Post-Incident Review" },
  { id: "targeted_investigation", label: "Targeted Investigation" },
] as const;

export type AuditTypeId = (typeof AUDIT_TYPES)[number]["id"];

export function frameworkLabel(slug: string | null | undefined): string {
  if (!slug) return "Unframed";
  const match = AUDIT_FRAMEWORKS.find((f) => f.slug === slug);
  if (match) return match.label;
  if (slug === "iso27001-2022") return "ISO 27001:2022";
  if (slug === "gdpr-2016-679") return "GDPR";
  return slug;
}

export function auditTypeLabel(id: string | null | undefined): string {
  if (!id) return "Unframed";
  const match = AUDIT_TYPES.find((t) => t.id === id);
  return match ? match.label : id;
}
