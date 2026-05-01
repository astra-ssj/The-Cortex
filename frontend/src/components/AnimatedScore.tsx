import type { CSSProperties } from "react";
import { useCountUp } from "../hooks/useCountUp";
import { useInView } from "../hooks/useInView";

interface AnimatedScoreProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  duration?: number;
  delay?: number;
  showLabel?: boolean;
  color?: string;
}

function scoreColor(score: number): string {
  if (score >= 70) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

export function AnimatedScoreRing({
  value,
  size = 80,
  strokeWidth = 6,
  duration = 1400,
  delay = 0,
  showLabel = true,
  color,
}: AnimatedScoreProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const count = useCountUp({
    target: inView ? value : 0,
    duration,
    delay,
    easing: "easeOut",
  });

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = (count / 100) * circumference;
  const strokeColor = color ?? scoreColor(value);

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${strokeDash} ${circumference}`}
          style={{
            transition: "stroke-dasharray 0.05s linear",
            filter: `drop-shadow(0 0 4px ${strokeColor}88)`,
          }}
        />
      </svg>
      {showLabel ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Space Mono', monospace",
            fontSize: size * 0.18,
            fontWeight: 700,
            color: strokeColor,
          }}
        >
          {count}%
        </div>
      ) : null}
    </div>
  );
}

export function AnimatedNumber({
  value,
  duration = 1000,
  delay = 0,
  suffix = "",
  prefix = "",
  decimals = 0,
  style = {} as CSSProperties,
}: {
  value: number;
  duration?: number;
  delay?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  style?: CSSProperties;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const count = useCountUp({
    target: inView ? value : 0,
    duration,
    delay,
    decimals,
    easing: "easeOut",
  });

  return (
    <span ref={ref} style={style}>
      {prefix}
      {count}
      {suffix}
    </span>
  );
}
