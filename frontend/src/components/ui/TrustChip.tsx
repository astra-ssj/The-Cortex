import type { ReactNode } from "react";

type TrustChipVariant = "source" | "engine" | "connector" | "neutral";

/**
 * Standardised provenance / engine chips for Shasta, connectors, and assessment sources.
 * Keeps trust UI consistent across Compliance and Cloud scans surfaces.
 */
export function TrustChip({
  label,
  children,
  variant = "neutral",
  className = "",
}: {
  label: string;
  children?: ReactNode;
  variant?: TrustChipVariant;
  className?: string;
}) {
  return (
    <span className={`cortex-trust-chip ${className}`.trim()} data-variant={variant}>
      <span className="cortex-trust-chip-label">{label}</span>
      {children != null && <span className="truncate font-semibold text-[var(--text)]">{children}</span>}
    </span>
  );
}

/** Compact “Powered by …” treatment for nav and page heroes (teal, uppercase micro). */
export function EngineBadge({ name, compact = false }: { name: string; compact?: boolean }) {
  return (
    <span
      className="whitespace-nowrap font-mono text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-[var(--accent-teal)]"
      title={compact ? `Powered by ${name}` : `Engine: ${name}`}
    >
      {compact ? name : `Powered by ${name}`}
    </span>
  );
}
