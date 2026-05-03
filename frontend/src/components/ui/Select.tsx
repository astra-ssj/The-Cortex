import { forwardRef, useId, type SelectHTMLAttributes } from "react";

export type SelectSize = "sm" | "md" | "lg";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  selectSize?: SelectSize;
}

const sizeClasses: Record<SelectSize, string> = {
  sm: "min-h-[28px] px-3 py-1 text-xs",
  md: "min-h-[34px] px-3 py-1.5 text-sm",
  lg: "min-h-[40px] px-3 py-2 text-sm",
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      label,
      error,
      hint,
      options,
      selectSize = "md",
      className = "",
      id,
      ...rest
    },
    ref,
  ) {
    const hasError = error !== undefined && error !== "";

    const border = hasError
      ? "border-cortex-red focus-visible:border-cortex-red focus-visible:shadow-[var(--focus-ring)]"
      : "border-cortex-border focus-visible:border-cortex-blue focus-visible:shadow-[var(--focus-ring)]";

    const uid = useId();
    const selectId = id ?? `cortex-select-${uid}`;
    const hintId = hint ? `cortex-select-hint-${uid}` : undefined;
    const errId = error ? `cortex-select-err-${uid}` : undefined;

    return (
      <div className={`flex w-full flex-col gap-1.5 ${className}`}>
        {label ? (
          <label
            className="text-xs font-medium uppercase tracking-[0.04em] text-cortex-text-sec"
            htmlFor={selectId}
          >
            {label}
          </label>
        ) : null}
        <div
          className={`relative flex w-full items-center rounded-[var(--radius-sm)] border bg-cortex-surface ${border} transition-colors`}
        >
          <select
            ref={ref}
            id={selectId}
            className={`w-full cursor-pointer appearance-none rounded-[var(--radius-sm)] bg-transparent pr-8 text-cortex-text focus:outline-none ${sizeClasses[selectSize]} px-3`}
            aria-invalid={hasError || undefined}
            aria-describedby={
              [hintId, errId].filter(Boolean).join(" ") || undefined
            }
            {...rest}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Chevron className="pointer-events-none absolute right-2 text-cortex-text-ter" />
        </div>
        {hint && !error ? (
          <p id={hintId} className="text-xs text-cortex-text-ter">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errId} className="text-xs text-cortex-red">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
    </svg>
  );
}
