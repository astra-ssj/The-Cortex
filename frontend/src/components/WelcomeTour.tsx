import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/Button";
import {
  TOUR_REPLAY_EVENT,
  TOUR_STEPS,
  isTourDone,
  markTourDone,
} from "../lib/welcomeTour";

const PAD = 8;
const CARD_W = 360;
const SIDEBAR_W = 220;

type Hole = { top: number; left: number; width: number; height: number };

function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

function measureTarget(selector: string | null): Hole | null {
  if (!selector) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: Math.max(8, r.top - PAD),
    left: Math.max(8, r.left - PAD),
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

function cardPosition(hole: Hole | null): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!hole) {
    return {
      top: Math.max(24, Math.min(vh * 0.22, vh - 280)),
      left: Math.min(vw - CARD_W - 24, SIDEBAR_W + 28),
    };
  }
  const rightOf = hole.left + hole.width + 16;
  const left =
    rightOf + CARD_W + 16 <= vw
      ? rightOf
      : Math.max(16, hole.left + hole.width - CARD_W);
  const top = Math.max(16, Math.min(hole.top, vh - 260));
  return { top, left };
}

export function WelcomeTour() {
  const [open, setOpen] = useState(() => !isTourDone());
  const [step, setStep] = useState(0);
  const [hole, setHole] = useState<Hole | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastActive = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const reduceMotion = prefersReducedMotion();

  const current = TOUR_STEPS[step] ?? TOUR_STEPS[0];
  const total = TOUR_STEPS.length;
  const isLast = step >= total - 1;

  const syncHole = useCallback(() => {
    const target = TOUR_STEPS[step]?.target ?? null;
    setHole(measureTarget(target));
  }, [step]);

  const finish = useCallback(() => {
    markTourDone();
    setOpen(false);
    setStep(0);
  }, []);

  useEffect(() => {
    const onReplay = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, onReplay);
  }, []);

  useEffect(() => {
    if (open) {
      document.documentElement.dataset.welcomeTour = "1";
    } else {
      delete document.documentElement.dataset.welcomeTour;
    }
    return () => {
      delete document.documentElement.dataset.welcomeTour;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    syncHole();
    const onResize = () => syncHole();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, syncHole]);

  useEffect(() => {
    if (!open) return;
    lastActive.current = document.activeElement as HTMLElement;
    const t = window.setTimeout(() => {
      const root = panelRef.current;
      if (!root) return;
      const f = getFocusable(root);
      (f[0] ?? root).focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      lastActive.current?.focus?.();
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = getFocusable(panelRef.current);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) return;
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

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, finish]);

  if (!open || !current) return null;

  const pos = cardPosition(hole);
  const holeStyle: CSSProperties | undefined = hole
    ? {
        position: "fixed",
        top: hole.top,
        left: hole.left,
        width: hole.width,
        height: hole.height,
        borderRadius: 8,
        boxShadow: "0 0 0 9999px color-mix(in srgb, var(--bg) 72%, transparent)",
        outline: "2px solid var(--blue)",
        outlineOffset: 0,
        pointerEvents: "none",
        transition: reduceMotion ? "none" : "top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease",
      }
    : undefined;

  const content = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        pointerEvents: "none",
      }}
    >
      {!hole ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "color-mix(in srgb, var(--bg) 72%, transparent)",
            pointerEvents: "auto",
          }}
        />
      ) : (
        <div aria-hidden style={holeStyle} />
      )}
      {hole ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "auto",
          }}
        />
      ) : null}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: CARD_W,
          maxWidth: "calc(100vw - 32px)",
          pointerEvents: "auto",
          background: "var(--elevated)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow-drop-lg)",
          padding: "18px 18px 14px",
          fontFamily: "var(--font-sans)",
          zIndex: 1,
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          {step + 1} / {total}
        </p>
        <h2
          id={titleId}
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          {current.title}
        </h2>
        <p
          id={descId}
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--text-secondary)",
          }}
        >
          {current.body}
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 16,
          }}
        >
          <Button variant="ghost" size="sm" onClick={finish}>
            Skip
          </Button>
          <div style={{ flex: 1 }} />
          {step > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (isLast) {
                finish();
                return;
              }
              setStep((s) => s + 1);
            }}
          >
            {isLast ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
