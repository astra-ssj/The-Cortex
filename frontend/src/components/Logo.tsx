/** Astra GRC mark — eight-point star in a seal ring. */

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
      aria-hidden
      style={
        glow
          ? {
              filter: "var(--logo-glow-filter)",
            }
          : undefined
      }
    >
      <circle
        cx="40"
        cy="40"
        r="34"
        stroke="var(--cyan)"
        strokeWidth="1.5"
        opacity="0.35"
      />
      <circle
        cx="40"
        cy="40"
        r="27"
        stroke="var(--cyan)"
        strokeWidth="1.25"
        opacity="0.7"
      />
      {/* Cardinal points */}
      <path
        d="M40 10 L44.4 35.6 L70 40 L44.4 44.4 L40 70 L35.6 44.4 L10 40 L35.6 35.6 Z"
        fill="var(--cyan)"
      />
      {/* Ordinal points */}
      <path
        d="M40 18 L57.3 22.7 L62 40 L57.3 57.3 L40 62 L22.7 57.3 L18 40 L22.7 22.7 Z"
        fill="var(--cyan)"
        opacity="0.55"
      />
      <circle cx="40" cy="40" r="5" fill="var(--bg)" />
      <circle cx="40" cy="40" r="2.5" fill="var(--cyan)" />
    </svg>
  );
}

export function LogoWordmark({ fontSize = 24 }: { fontSize?: number }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize,
        letterSpacing: "0.01em",
        color: "var(--text)",
        lineHeight: 1.15,
      }}
    >
      Astra{" "}
      <span
        style={{
          color: "var(--cyan)",
          fontWeight: 700,
          letterSpacing: "0.08em",
        }}
      >
        GRC
      </span>
    </span>
  );
}

interface LogoFullProps {
  size?: "sm" | "md" | "lg";
}

export function LogoFull({ size = "md" }: LogoFullProps) {
  const config = {
    sm: { iconSize: 20, fontSize: 15 },
    md: { iconSize: 28, fontSize: 18 },
    lg: { iconSize: 56, fontSize: 32 },
  };
  const c = config[size];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: size === "lg" ? 16 : 10,
      }}
    >
      <LogoIcon size={c.iconSize} glow={size !== "sm"} />
      <LogoWordmark fontSize={c.fontSize} />
    </div>
  );
}

export function LogoFavicon() {
  return (
    <svg width="32" height="32" viewBox="0 0 80 80" fill="none" aria-hidden>
      <circle cx="40" cy="40" r="34" stroke="var(--cyan)" strokeWidth="2" opacity="0.4" />
      <path
        d="M40 10 L44.4 35.6 L70 40 L44.4 44.4 L40 70 L35.6 44.4 L10 40 L35.6 35.6 Z"
        fill="var(--cyan)"
      />
      <circle cx="40" cy="40" r="5" fill="var(--bg)" />
      <circle cx="40" cy="40" r="2.5" fill="var(--cyan)" />
    </svg>
  );
}

export default LogoFull;
