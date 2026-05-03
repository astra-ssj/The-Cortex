import type { ReactNode } from "react";
import { Badge } from "./Badge";

export interface ComingSoonProps {
  feature: string;
  description: string;
  icon?: ReactNode;
  eta?: string;
}

/**
 * Full-area placeholder for unreleased features — replaces page content (not a modal).
 */
export function ComingSoon({ feature, description, icon, eta }: ComingSoonProps) {
  return (
    <div
      className="relative flex min-h-[min(560px,calc(100vh-200px))] w-full flex-col items-center justify-center overflow-hidden rounded-xl px-6 py-16"
      style={{
        border: "1px solid var(--border-subtle)",
        backgroundColor: "var(--card)",
        backgroundImage: `
          repeating-linear-gradient(
            0deg,
            transparent,
            transparent 11px,
            color-mix(in srgb, var(--border-subtle) 40%, transparent) 11px,
            color-mix(in srgb, var(--border-subtle) 40%, transparent) 12px
          ),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 11px,
            color-mix(in srgb, var(--border-subtle) 35%, transparent) 11px,
            color-mix(in srgb, var(--border-subtle) 35%, transparent) 12px
          )
        `,
      }}
    >
      <div className="relative z-[1] flex max-w-lg flex-col items-center text-center">
        <div
          className="mb-5 flex h-16 w-16 items-center justify-center text-[color:var(--text-tertiary)] opacity-80"
          aria-hidden
        >
          {icon ?? (
            <svg viewBox="0 0 64 64" fill="none" className="h-14 w-14" aria-hidden>
              <path
                d="M32 8v12M32 44v12M8 32h12M44 32h12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.35"
              />
              <circle cx="32" cy="32" r="10" stroke="currentColor" strokeWidth="2" opacity="0.5" />
            </svg>
          )}
        </div>
        <p
          className="font-ui text-[20px] font-semibold leading-tight text-[color:var(--text)]"
          style={{ fontWeight: 600 }}
        >
          Coming Soon
        </p>
        <p className="mt-2 font-ui text-sm text-[color:var(--text-secondary)]">{feature}</p>
        <p className="mt-3 max-w-[400px] font-ui text-[13px] leading-relaxed text-[color:var(--text-tertiary)]">
          {description}
        </p>
        {eta ? (
          <div className="mt-6">
            <Badge variant="neutral" size="xs">
              {eta}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
}
