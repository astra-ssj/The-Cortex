import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-cortex-blue text-cortex-text hover:brightness-110 active:brightness-95 disabled:opacity-50",
  secondary:
    "border border-cortex-border bg-transparent text-cortex-text hover:bg-cortex-card-hover active:bg-cortex-surface disabled:opacity-50",
  ghost:
    "border border-transparent bg-transparent text-cortex-text-sec hover:bg-cortex-card-hover hover:text-cortex-text active:bg-cortex-surface disabled:opacity-50",
  danger:
    "border border-transparent bg-cortex-red text-cortex-text hover:brightness-110 active:brightness-95 disabled:opacity-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[28px] gap-1.5 px-3 text-xs",
  md: "min-h-[34px] gap-2 px-3.5 text-sm",
  lg: "min-h-[40px] gap-2 px-4 text-sm",
};

function Spinner() {
  return (
    <svg
      className="h-4 w-4 shrink-0 animate-spin"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      icon,
      className = "",
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    const isDisabled = Boolean(disabled || loading);
    const base =
      "inline-flex items-center justify-center rounded-[var(--radius-sm)] font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]";

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={`${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...rest}
      >
        {loading ? (
          <span className="relative inline-flex items-center justify-center">
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner />
            </span>
            <span className="invisible inline-flex items-center gap-2">
              {icon ? (
                <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
              ) : null}
              {children}
            </span>
          </span>
        ) : (
          <>
            {icon ? (
              <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
            ) : null}
            {children}
          </>
        )}
      </button>
    );
  },
);
