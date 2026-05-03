import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ModalSize = "sm" | "md" | "lg";

const sizeToClass: Record<ModalSize, string> = {
  sm: "w-full max-w-[400px]",
  md: "w-full max-w-[560px]",
  lg: "w-full max-w-[720px]",
};

const ModalA11yContext = createContext<{
  titleId: string;
  setTitleVisible: (v: boolean) => void;
} | null>(null);

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  const sel = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(", ");
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
  );
}

function ModalRoot({
  open,
  onClose,
  size = "md",
  children,
  className = "",
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const lastActive = useRef<HTMLElement | null>(null);
  const [entered, setEntered] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);

  const a11yValue = useMemo(
    () => ({ titleId, setTitleVisible }),
    [titleId],
  );

  const onCloseStable = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      setTitleVisible(false);
      return;
    }
    lastActive.current = document.activeElement as HTMLElement;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => setEntered(true));

    const t = window.setTimeout(() => {
      const root = panelRef.current;
      if (root) {
        const f = getFocusable(root);
        (f[0] ?? root).focus();
      }
    }, 0);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(t);
      document.body.style.overflow = original;
      lastActive.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseStable();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) {
        return;
      }
      const focusables = getFocusable(panelRef.current);
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) {
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCloseStable]);

  if (!open) {
    return null;
  }

  const content = (
    <ModalA11yContext.Provider value={a11yValue}>
      <div
        className={`fixed inset-0 z-[200] flex items-center justify-center p-4 transition-opacity duration-150 ${entered ? "opacity-100" : "opacity-0"}`}
        role="presentation"
      >
        <button
          type="button"
          className={`absolute inset-0 cursor-default bg-[var(--modal-backdrop)] transition-opacity duration-150 ${entered ? "opacity-100" : "opacity-0"}`}
          aria-label="Close dialog"
          onClick={onCloseStable}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={titleVisible ? undefined : ariaLabel}
          aria-labelledby={titleVisible ? titleId : undefined}
          aria-describedby={ariaDescribedBy}
          tabIndex={-1}
          className={`relative z-[201] max-h-[90vh] overflow-hidden rounded-[12px] border border-cortex-border bg-cortex-elevated shadow-[var(--shadow-drop-lg)] transition-opacity duration-150 ${entered ? "opacity-100" : "opacity-0"} ${sizeToClass[size]} ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </ModalA11yContext.Provider>
  );

  return createPortal(content, document.body);
}

export interface ModalHeaderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  onClose?: () => void;
}

function ModalHeader({
  title,
  onClose,
  children,
  className = "",
  ...rest
}: ModalHeaderProps) {
  const a11y = useContext(ModalA11yContext);

  useEffect(() => {
    a11y?.setTitleVisible(true);
    return () => a11y?.setTitleVisible(false);
  }, [a11y]);

  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-cortex-border px-4 py-3 ${className}`}
      {...rest}
    >
      <div
        id={a11y?.titleId}
        className="min-w-0 text-sm font-semibold text-cortex-text"
      >
        {title ?? children}
      </div>
      {onClose ? (
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-cortex-text-sec transition-colors hover:bg-cortex-card-hover hover:text-cortex-text focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export interface ModalBodyProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

function ModalBody({ children, className = "", ...rest }: ModalBodyProps) {
  return (
    <div
      className={`max-h-[calc(90vh-120px)] overflow-y-auto px-4 py-4 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface ModalFooterProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

function ModalFooter({ children, className = "", ...rest }: ModalFooterProps) {
  return (
    <div
      className={`flex justify-end gap-2 border-t border-cortex-border px-4 py-3 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export const Modal = Object.assign(ModalRoot, {
  Header: ModalHeader,
  Body: ModalBody,
  Footer: ModalFooter,
});
