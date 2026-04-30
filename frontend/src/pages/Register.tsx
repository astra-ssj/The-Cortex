import { useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogoIcon } from "../components/Logo";

const JURIS_OPTIONS = ["DE", "UK", "AU", "TH", "ES", "US", "Other"] as const;
const INDUSTRY_OPTIONS = [
  "Cybersecurity",
  "Finance",
  "Healthcare",
  "Aviation",
  "Rail",
  "Defence",
  "Other",
] as const;

export default function Register() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [jurisdiction, setJurisdiction] = useState<string>("DE");
  const [industry, setIndustry] = useState<string>("Finance");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!companyName.trim() || !fullName.trim() || !email.trim()) {
      setError("Company name, full name, and email are required.");
      return;
    }
    setLoading(true);
    try {
      const base = import.meta.env.DEV ? "" : "http://localhost:8000";
      const res = await fetch(`${base}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          jurisdiction,
          industry,
          email: email.trim(),
          password,
          full_name: fullName.trim(),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { detail?: string }).detail || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        access_token: string;
        org_id: string;
        onboarding_step?: number;
      };
      localStorage.setItem("cortex_token", data.access_token);
      localStorage.setItem("cortex_org_id", data.org_id);
      localStorage.setItem("cortex_jurisdiction", jurisdiction);
      localStorage.setItem("cortex_demo_mode", "false");
      const userPayload = {
        email: email.trim(),
        name: fullName.trim(),
        org_id: data.org_id,
        onboarding_complete: false,
        onboarding_step: data.onboarding_step ?? 1,
        is_demo: false,
      };
      localStorage.setItem("cortex_user", JSON.stringify(userPayload));
      navigate("/onboarding", { replace: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#05080f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#090e1a",
          border: "1px solid #141e30",
          borderRadius: 12,
          padding: 32,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <LogoIcon size={64} glow />
          <span
            style={{
              fontFamily: "'Syne', 'DM Sans', sans-serif",
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: "6px",
              color: "#e2e8f4",
            }}
          >
            CORTEX
          </span>
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              letterSpacing: "3px",
              color: "#2dd4bf",
              textTransform: "uppercase",
            }}
          >
            Create organisation
          </span>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#fca5a5",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Company Name</label>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Jurisdiction</label>
            <select
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {JURIS_OPTIONS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Industry</label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {INDUSTRY_OPTIONS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Full Name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Confirm Password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
        </div>

        <button type="button" onClick={handleSubmit} disabled={loading} style={btnStyle(loading)}>
          {loading ? "Creating…" : "Create account"}
        </button>

        <p style={{ marginTop: 20, textAlign: "center", fontSize: 13 }}>
          <Link to="/login" style={{ color: "#2dd4bf", textDecoration: "none" }}>
            Already have an account? Sign in →
          </Link>
        </p>
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  color: "#94a3b8",
  fontSize: 12,
  fontFamily: "'DM Mono', monospace",
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #141e30",
  background: "#0c1220",
  color: "#e2e8f4",
  fontSize: 14,
  boxSizing: "border-box",
};

function btnStyle(loading: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 8,
    background: loading ? "#1e2e48" : "linear-gradient(135deg, #2563eb, #3b82f6)",
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.8 : 1,
  };
}
