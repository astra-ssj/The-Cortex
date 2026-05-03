import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant =
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "purple";

export type BadgeSize = "xs" | "sm" | "md";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children?: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  info: "border border-cortex-blue/35 bg-cortex-blue/[0.12] text-cortex-blue",
  success:
    "border border-cortex-green/35 bg-cortex-green/[0.1] text-cortex-green",
  warning:
    "border border-cortex-amber/35 bg-cortex-amber/[0.1] text-cortex-amber",
  danger: "border border-cortex-red/35 bg-cortex-red/[0.1] text-cortex-red",
  neutral: "border border-cortex-border bg-cortex-surface text-cortex-text-ter",
  purple:
    "border border-cortex-purple/35 bg-cortex-purple/[0.1] text-cortex-purple",
};

const dotClasses: Record<BadgeVariant, string> = {
  info: "bg-cortex-blue",
  success: "bg-cortex-green",
  warning: "bg-cortex-amber",
  danger: "bg-cortex-red",
  neutral: "bg-cortex-text-ter",
  purple: "bg-cortex-purple",
};

const sizeClasses: Record<BadgeSize, string> = {
  xs: "min-h-[18px] px-2 text-[10px] leading-tight",
  sm: "min-h-[22px] px-2 text-[11px] leading-tight",
  md: "min-h-[26px] px-2.5 text-xs leading-tight",
};

export function Badge({
  variant = "neutral",
  size = "sm",
  dot = false,
  className = "",
  children,
  ...rest
}: BadgeProps) {
  const base =
    "inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-pill)] font-semibold uppercase tracking-[0.03em]";

  return (
    <span
      className={`${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {dot ? (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-[var(--radius-pill)] ${dotClasses[variant]}`}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}
