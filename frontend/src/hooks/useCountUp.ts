import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface UseCountUpOptions {
  target: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  easing?: "linear" | "easeOut" | "easeInOut";
}

export function useCountUp({
  target,
  duration = 1200,
  delay = 0,
  decimals = 0,
  easing = "easeOut",
}: UseCountUpOptions) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | undefined>(undefined);
  const startRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target === 0 ? 0 : Math.round(target * 10 ** decimals) / 10 ** decimals);
      return;
    }

    if (target === 0) {
      setValue(0);
      return;
    }

    const timer = setTimeout(() => {
      const animate = (timestamp: number) => {
        if (startRef.current === undefined) {
          startRef.current = timestamp;
        }

        const elapsed = timestamp - startRef.current;
        const progress = Math.min(elapsed / duration, 1);

        let eased: number;
        switch (easing) {
          case "easeOut":
            eased = 1 - (1 - progress) ** 3;
            break;
          case "easeInOut":
            eased =
              progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
            break;
          default:
            eased = progress;
        }

        const current =
          Math.round(eased * target * 10 ** decimals) / 10 ** decimals;

        setValue(current);

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate);
        }
      };

      startRef.current = undefined;
      frameRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timer);
      if (frameRef.current !== undefined) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [target, duration, delay, decimals, easing]);

  return value;
}
