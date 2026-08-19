import { useEffect } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { LogoIcon } from "../components/Logo";

export default function Onboarding() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      navigate("/learning", { replace: true });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 30,
          boxShadow: "var(--shadow-drop-lg)",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <LogoIcon size={48} glow />
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: "6px",
              color: "var(--text)",
            }}
          >
            CORTEX
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "2px",
              color: "var(--cyan)",
            }}
          >
            Community Edition
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 16,
              color: "var(--text-secondary)",
              textAlign: "center",
            }}
          >
            Master GRC through adversarial simulation.
          </span>
        </div>

        <h1
          style={{
            margin: 0,
            marginBottom: 10,
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          Welcome to CORTEX
        </h1>
        <p
          style={{
            margin: "0 0 24px",
            color: "var(--text-secondary)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Your account is ready. Start your first scenario to begin building GRC competency.
        </p>

        <button
          type="button"
          onClick={() => navigate("/learning", { replace: true })}
          style={buttonStyle}
        >
          Go to Learning →
        </button>

        <p
          style={{
            margin: "18px 0 0",
            color: "var(--text-tertiary)",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          Choose a scenario, make decisions under pressure, and track your competency across four dimensions.
        </p>
      </div>
    </div>
  );
}

const buttonStyle: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  background: "linear-gradient(135deg, color-mix(in srgb, var(--blue) 90%, black), var(--blue))",
  border: "none",
  color: "var(--text)",
  fontSize: 14,
  fontWeight: "bold",
  cursor: "pointer",
};
