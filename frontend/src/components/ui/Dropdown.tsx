import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type DropdownAlign = "left" | "right";

export interface DropdownItemConfig {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItemConfig[];
  align?: DropdownAlign;
  className?: string;
}

export function Dropdown({
  trigger,
  items,
  align = "left",
  className = "",
}: DropdownProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuId = useId();

  const alignClass =
    align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left";

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDocMouseDown(e: MouseEvent) {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const firstEnabled = items.findIndex((i) => !i.disabled);
    const next = firstEnabled >= 0 ? firstEnabled : 0;
    setActiveIndex(next);
    const rafId = window.requestAnimationFrame(() => {
      focusItem(next);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [open, items]);

  function focusItem(index: number) {
    const node = menuRef.current?.querySelector<HTMLButtonElement>(
      `[data-index="${index}"]`,
    );
    node?.focus();
  }

  function moveActive(delta: number) {
    if (items.length === 0) {
      return;
    }
    let i = activeIndex;
    for (let step = 0; step < items.length; step++) {
      i = (i + delta + items.length) % items.length;
      if (!items[i]?.disabled) {
        setActiveIndex(i);
        focusItem(i);
        return;
      }
    }
  }

  function onRootKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item && !item.disabled) {
        item.onClick();
        close();
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={`relative inline-block ${className}`}
      onKeyDown={onRootKeyDown}
    >
      <div
        role="button"
        tabIndex={0}
        className="inline-flex cursor-pointer items-center rounded-[var(--radius-sm)] border border-transparent bg-transparent text-cortex-text focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        {trigger}
      </div>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className={`absolute top-full z-[180] mt-1 min-w-[200px] rounded-[var(--radius-sm)] border border-cortex-border bg-cortex-elevated py-1 shadow-[var(--shadow-drop-md)] ${alignClass}`}
        >
          {items.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              role="menuitem"
              data-index={index}
              tabIndex={index === activeIndex ? 0 : -1}
              disabled={item.disabled === true}
              className={`flex h-8 w-full items-center gap-2 px-3 text-left text-xs text-cortex-text transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 ${
                item.danger === true
                  ? "hover:bg-cortex-red/[0.12]"
                  : "hover:bg-cortex-card-hover"
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick();
                  close();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                }
              }}
            >
              {item.icon ? (
                <span className="shrink-0 text-cortex-text-sec [&>svg]:h-4 [&>svg]:w-4">
                  {item.icon}
                </span>
              ) : null}
              <span className={item.danger === true ? "text-cortex-red" : ""}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
