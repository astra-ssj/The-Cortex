import { useId, type InputHTMLAttributes } from "react";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  className = "",
  id,
  ...rest
}: CheckboxProps) {
  const uid = useId();
  const inputId = id ?? `cortex-checkbox-${uid}`;

  return (
    <label
      htmlFor={inputId}
      className={`flex cursor-pointer items-start gap-2.5 text-sm text-cortex-text ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      } ${className}`}
    >
      <input
        id={inputId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-cortex-border bg-cortex-surface text-cortex-blue accent-cortex-blue focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        {...rest}
      />
      <span className="min-w-0 leading-snug">{label}</span>
    </label>
  );
}
