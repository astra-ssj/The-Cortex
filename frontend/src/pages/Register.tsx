import { useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogoIcon } from "../components/Logo";
import { setStoredOrgId } from "../hooks/useOrgContext";

type RegisterForm = {
  company_name: string;
  jurisdiction: string;
  industry: string;
  full_name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type RegisterErrors = Partial<Record<keyof RegisterForm, string>>;

const JURIS_OPTIONS = [
  { value: "DE", label: "DE — Germany" },
  { value: "UK", label: "UK — United Kingdom" },
  { value: "AU", label: "AU — Australia" },
  { value: "TH", label: "TH — Thailand" },
  { value: "ES", label: "ES — Spain" },
  { value: "US", label: "US — United States" },
  { value: "EU", label: "EU — European Union" },
  { value: "OTHER", label: "OTHER — Other" },
] as const;

const INDUSTRY_OPTIONS = [
  "Cybersecurity",
  "Finance",
  "Healthcare",
  "Aviation",
  "Rail",
  "Defence",
  "Technology",
  "Other",
] as const;

function validateForm(form: RegisterForm): RegisterErrors {
  const next: RegisterErrors = {};
  if (!form.company_name.trim()) next.company_name = "Company name is required.";
  if (!form.jurisdiction) next.jurisdiction = "Jurisdiction is required.";
  if (!form.industry) next.industry = "Industry is required.";
  if (!form.full_name.trim()) next.full_name = "Full name is required.";
  if (!form.email.trim()) next.email = "Work email is required.";
  if (!form.password) next.password = "Password is required.";
  if (form.password && form.password.length < 8) {
    next.password = "Password must be at least 8 characters.";
  }
  if (!form.confirmPassword) next.confirmPassword = "Please confirm your password.";
  if (form.password && form.confirmPassword && form.password !== form.confirmPassword) {
    next.confirmPassword = "Passwords must match.";
  }
  return next;
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterForm>({
    company_name: "",
    jurisdiction: "DE",
    industry: "Cybersecurity",
    full_name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [loading, setLoading] = useState(false);
  const [bannerError, setBannerError] = useState("");

  const setField = <K extends keyof RegisterForm>(key: K, value: RegisterForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async () => {
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setBannerError("");
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const base = import.meta.env.DEV ? "" : "http://localhost:8000";
      const response = await fetch(`${base}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company_name.trim(),
          jurisdiction: form.jurisdiction,
          industry: form.industry,
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          password: form.password,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          setBannerError("Email already registered. Sign in instead.");
          return;
        }
        if (response.status === 400) {
          const payload = (await response.json().catch(() => ({}))) as { detail?: string };
          setBannerError(payload.detail ?? "Invalid registration payload.");
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        setBannerError(payload.detail ?? "Registration failed. Please try again.");
        return;
      }

      const data = (await response.json()) as { access_token: string; org_id: string };
      localStorage.setItem("cortex_token", data.access_token);
      localStorage.setItem(
        "cortex_user",
        JSON.stringify({
          email: form.email.trim(),
          name: form.full_name.trim() || form.email.trim(),
          org_id: data.org_id,
        }),
      );
      localStorage.setItem("cortex_company", form.company_name.trim());
      setStoredOrgId(data.org_id);
      localStorage.setItem("cortex_jurisdiction", form.jurisdiction);
      localStorage.setItem("cortex_demo_mode", "false");
      localStorage.setItem(
        "cortex_onboarding",
        JSON.stringify({
          complete: false,
          step: 1,
        })
      );
      navigate("/onboarding", { replace: true });
    } catch (error) {
      setBannerError(error instanceof Error ? error.message : "Registration failed.");
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
        padding: 16,
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#090e1a",
          border: "1px solid #141e30",
          borderRadius: 12,
          padding: 30,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <LogoIcon size={48} glow />
          <span
            style={{
              fontFamily: "'Syne', 'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: "6px",
              color: "#e2e8f4",
            }}
          >
            CORTEX
          </span>
          <span
            style={{
              fontFamily: "'Space Mono', 'DM Mono', monospace",
              fontSize: 11,
              letterSpacing: "2px",
              color: "#2dd4bf",
            }}
          >
            Zero Trust AI Platform
          </span>
        </div>

        {bannerError && (
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
            {bannerError}
          </div>
        )}

        <Field label="Company Name" error={errors.company_name}>
          <input
            value={form.company_name}
            onChange={(e) => setField("company_name", e.target.value)}
            placeholder="AstraLabs GmbH"
            style={inputStyle}
          />
        </Field>

        <Field label="Jurisdiction" error={errors.jurisdiction}>
          <select value={form.jurisdiction} onChange={(e) => setField("jurisdiction", e.target.value)} style={inputStyle}>
            {JURIS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Industry" error={errors.industry}>
          <select value={form.industry} onChange={(e) => setField("industry", e.target.value)} style={inputStyle}>
            {INDUSTRY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Full Name" error={errors.full_name}>
          <input
            value={form.full_name}
            onChange={(e) => setField("full_name", e.target.value)}
            placeholder="Jane Smith"
            style={inputStyle}
          />
        </Field>

        <Field label="Work Email" error={errors.email}>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            placeholder="ciso@company.com"
            style={inputStyle}
          />
        </Field>

        <Field label="Password" error={errors.password}>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            placeholder="Min. 8 characters"
            style={inputStyle}
          />
        </Field>

        <Field label="Confirm Password" error={errors.confirmPassword}>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setField("confirmPassword", e.target.value)}
            placeholder="Repeat password"
            style={inputStyle}
          />
        </Field>

        <button type="button" onClick={handleSubmit} disabled={loading} style={submitStyle(loading)}>
          {loading ? "Creating account..." : "Create Account →"}
        </button>

        <p style={{ marginTop: 16, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "#2dd4bf", textDecoration: "none" }}>
            Sign in →
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {error ? (
        <div style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>{error}</div>
      ) : null}
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  color: "#94a3b8",
  fontSize: 12,
  marginBottom: 6,
  fontFamily: "'DM Mono', monospace",
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

function submitStyle(disabled: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 8,
    background: disabled ? "#1e2e48" : "linear-gradient(135deg, #2563eb, #3b82f6)",
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.8 : 1,
  };
}
