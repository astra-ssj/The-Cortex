import { useOrgContext } from "../hooks/useOrgContext";

/**
 * Demo vs live data toggle — hidden when the signed-in tenant is the shared demo org only.
 */
export function DemoToggle() {
  const { demoMode, toggleDemoMode, isDemoOrg } = useOrgContext();

  if (isDemoOrg) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px",
        borderRadius: 8,
        background: "var(--elevated)",
        border: "1px solid var(--border)",
      }}
      title={demoMode ? "Showing AstraLabs demo data" : "Showing your live data"}
    >
      <span
        style={{
          color: demoMode ? "var(--amber)" : "var(--text-tertiary)",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          letterSpacing: 0.7,
        }}
      >
        DEMO
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={demoMode}
        onClick={toggleDemoMode}
        style={{
          width: 44,
          height: 22,
          borderRadius: 11,
          border: "none",
          cursor: "pointer",
          background: demoMode ? "var(--amber)" : "var(--cyan)",
          position: "relative",
          padding: 0,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: demoMode ? 4 : 24,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "var(--text)",
            transition: "left 0.15s ease",
            boxShadow: "var(--shadow-knob)",
          }}
        />
      </button>
      <span
        style={{
          color: demoMode ? "var(--text-tertiary)" : "var(--cyan)",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          letterSpacing: 0.7,
        }}
      >
        LIVE
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: "bold",
          letterSpacing: 1,
          padding: "2px 8px",
          borderRadius: 4,
          color: demoMode ? "var(--bg)" : "var(--text)",
          background: demoMode ? "var(--amber)" : "var(--cyan)",
        }}
      >
        {demoMode ? "DEMO DATA" : "LIVE"}
      </span>
    </div>
  );
}
