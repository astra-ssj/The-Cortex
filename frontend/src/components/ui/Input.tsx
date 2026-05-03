import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export type InputSize = "sm" | "md" | "lg";
export type InputVariant = "default" | "error";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  inputSize?: InputSize;
  variant?: InputVariant;
}

const sizeClasses: Record<InputSize, string> = {
  sm: "min-h-[28px] px-3 py-1 text-xs",
  md: "min-h-[34px] px-3 py-1.5 text-sm",
  lg: "min-h-[40px] px-3 py-2 text-sm",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      label,
      error,
      hint,
      icon,
      inputSize = "md",
      variant,
      className = "",
      id,
      ...rest
    },
    ref,
  ) {
    const uid = useId();
    const resolvedVariant: InputVariant =
      error !== undefined && error !== "" ? "error" : (variant ?? "default");

    const border =
      resolvedVariant === "error"
        ? "border-cortex-red focus-visible:border-cortex-red focus-visible:shadow-[var(--focus-ring)]"
        : "border-cortex-border focus-visible:border-cortex-blue focus-visible:shadow-[var(--focus-ring)]";

    const inputId = id ?? `cortex-input-${uid}`;
    const hintId = hint ? `cortex-input-hint-${uid}` : undefined;
    const errId = error ? `cortex-input-err-${uid}` : undefined;

    return (
      <div className={`flex w-full flex-col gap-1.5 ${className}`}>
        {label ? (
          <label
            className="text-xs font-medium uppercase tracking-[0.04em] text-cortex-text-sec"
            htmlFor={inputId}
          >
            {label}
          </label>
        ) : null}
        <div
          className={`relative flex w-full items-center rounded-[var(--radius-sm)] border bg-cortex-surface ${border} transition-colors focus-within:outline-none`}
        >
          {icon ? (
            <span className="pointer-events-none absolute left-3 flex text-cortex-text-ter [&>svg]:h-4 [&>svg]:w-4">
              {icon}
            </span>
          ) : null}
          <input
            ref={ref}
            id={inputId}
            className={`w-full rounded-[var(--radius-sm)] bg-transparent text-cortex-text placeholder:text-cortex-text-quiet focus:outline-none ${sizeClasses[inputSize]} ${icon ? "pl-9 pr-3" : "px-3"}`}
            aria-invalid={resolvedVariant === "error" || undefined}
            aria-describedby={
              [hintId, errId].filter(Boolean).join(" ") || undefined
            }
            {...rest}
          />
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
