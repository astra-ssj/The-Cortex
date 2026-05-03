import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  content: ReactNode;
  position?: TooltipPosition;
  delay?: number;
  children: ReactNode;
  className?: string;
}

const positionClasses: Record<TooltipPosition, string> = {
  top: "bottom-full left-1/2 mb-1 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-1 -translate-x-1/2",
  left: "right-full top-1/2 mr-1 -translate-y-1/2",
  right: "left-full top-1/2 ml-1 -translate-y-1/2",
};

export function Tooltip({
  content,
  position = "top",
  delay = 300,
  children,
  className = "",
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearShow = useCallback(() => {
    if (showTimer.current !== null) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);

  const clearHide = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearShow();
      clearHide();
    };
  }, [clearShow, clearHide]);

  function scheduleShow() {
    clearShow();
    clearHide();
    showTimer.current = setTimeout(() => {
      setVisible(true);
      requestAnimationFrame(() => setEntered(true));
    }, delay);
  }

  function scheduleHide() {
    clearShow();
    setEntered(false);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
    }, 100);
  }

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={scheduleShow}
      onMouseLeave={scheduleHide}
      onFocus={scheduleShow}
      onBlur={scheduleHide}
    >
      {children}
      {visible ? (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-[250] whitespace-nowrap rounded-[var(--radius-sm)] border border-cortex-border bg-cortex-elevated px-2.5 py-1.5 text-xs text-cortex-text shadow-[var(--shadow-drop-md)] transition-opacity duration-100 ${entered ? "opacity-100" : "opacity-0"} ${positionClasses[position]}`}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
