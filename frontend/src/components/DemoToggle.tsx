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
        background: "#141e30",
        border: "1px solid #1e2e48",
      }}
      title={demoMode ? "Showing AstraLabs demo data" : "Showing your live data"}
    >
      <span
        style={{
          color: demoMode ? "#f59e0b" : "#64748b",
          fontSize: 10,
          fontFamily: "'Space Mono', 'DM Mono', monospace",
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
          background: demoMode ? "#f59e0b" : "#2dd4bf",
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
            background: "#fff",
            transition: "left 0.15s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
        />
      </button>
      <span
        style={{
          color: demoMode ? "#64748b" : "#2dd4bf",
          fontSize: 10,
          fontFamily: "'Space Mono', 'DM Mono', monospace",
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
          color: demoMode ? "#451a03" : "#e2e8f4",
          background: demoMode ? "#fbbf24" : "#0e7490",
        }}
      >
        {demoMode ? "DEMO DATA" : "LIVE"}
      </span>
    </div>
  );
}
