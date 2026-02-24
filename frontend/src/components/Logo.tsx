// ── Shared arc SVG paths ──────────────────────
// Full Radar Arc C logo at any size
interface LogoIconProps {
  size?: number;
  glow?: boolean;
}

export function LogoIcon({ size = 32, glow = true }: LogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      style={
        glow
          ? {
              filter: "drop-shadow(0 0 8px rgba(45,212,191,0.5))",
            }
          : undefined
      }
    >
      {/* Arc 1 — outermost */}
      <path
        d="M 13 40 A 27 27 0 1 1 67 40"
        stroke="#2dd4bf"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* Arc 2 */}
      <path
        d="M 21 40 A 19 19 0 1 1 59 40"
        stroke="#2dd4bf"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Arc 3 */}
      <path
        d="M 29 40 A 11 11 0 1 1 51 40"
        stroke="#2dd4bf"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        opacity="0.3"
      />
      {/* Center dot */}
      <circle cx="40" cy="40" r="4.5" fill="#2dd4bf" />
      {/* End cap dots */}
      <circle cx="13" cy="40" r="3" fill="#2dd4bf" opacity="0.5" />
      <circle cx="67" cy="40" r="3" fill="#2dd4bf" opacity="0.5" />
    </svg>
  );
}

// Full logo with size variants
interface LogoFullProps {
  size?: "sm" | "md" | "lg";
}

export function LogoFull({ size = "md" }: LogoFullProps) {
  const config = {
    sm: { iconSize: 20, fontSize: 13, letterSpacing: "2px" },
    md: { iconSize: 28, fontSize: 16, letterSpacing: "3px" },
    lg: { iconSize: 56, fontSize: 32, letterSpacing: "6px" },
  };
  const c = config[size];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: size === "lg" ? 20 : 10,
      }}
    >
      <LogoIcon size={c.iconSize} glow={size !== "sm"} />
      <span
        style={{
          fontFamily: "'Syne', 'DM Sans', sans-serif",
          fontWeight: 800,
          fontSize: c.fontSize,
          letterSpacing: c.letterSpacing,
          color: "#e2e8f4",
          lineHeight: 1,
        }}
      >
        CORTEX
      </span>
    </div>
  );
}

// Favicon version — just arcs, no wordmark
export function LogoFavicon() {
  return (
    <svg width="32" height="32" viewBox="0 0 80 80" fill="none">
      <path
        d="M 10 40 A 30 30 0 1 1 70 40"
        stroke="#2dd4bf"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 24 40 A 16 16 0 1 1 56 40"
        stroke="#2dd4bf"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      />
      <circle cx="40" cy="40" r="7" fill="#2dd4bf" />
    </svg>
  );
}

export default LogoFull;
