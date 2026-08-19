import { useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
  invite_token: string;
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

function bannerFromApiError(payload: unknown, fallback: string): string {
  if (payload == null || typeof payload !== "object") return fallback;
  const o = payload as Record<string, unknown>;
  const nested = o.error;
  if (nested !== null && typeof nested === "object" && "message" in nested) {
    const m = (nested as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  const d = o.detail;
  if (typeof d === "string") return d;
  return fallback;
}

function validateForm(form: RegisterForm): RegisterErrors {
  const next: RegisterErrors = {};
  const joining = Boolean(form.invite_token.trim());
  if (!joining && !form.company_name.trim()) next.company_name = "Company name is required.";
  if (!joining && !form.jurisdiction) next.jurisdiction = "Jurisdiction is required.";
  if (!joining && !form.industry) next.industry = "Industry is required.";
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
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<RegisterForm>({
    company_name: "",
    jurisdiction: "DE",
    industry: "Cybersecurity",
    full_name: "",
    email: "",
    password: "",
    confirmPassword: "",
    invite_token: searchParams.get("invite") ?? "",
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
      const joining = Boolean(form.invite_token.trim());
      const response = await fetch(
        joining ? `${base}/api/v1/auth/accept-invite` : `${base}/api/v1/auth/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            joining
              ? {
                  token: form.invite_token.trim(),
                  password: form.password,
                  full_name: form.full_name.trim(),
                  email: form.email.trim(),
                }
              : {
                  company_name: form.company_name.trim(),
                  jurisdiction: form.jurisdiction,
                  industry: form.industry,
                  full_name: form.full_name.trim(),
                  email: form.email.trim(),
                  password: form.password,
                },
          ),
        },
      );

      if (!response.ok) {
        if (response.status === 409) {
          setBannerError("Email already registered. Sign in instead.");
          return;
        }
        if (response.status === 400) {
          const payload = await response.json().catch(() => ({}));
          setBannerError(bannerFromApiError(payload, "Invalid registration payload."));
          return;
        }
        const payload = await response.json().catch(() => ({}));
        setBannerError(bannerFromApiError(payload, "Registration failed. Please try again."));
        return;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        org_id: string;
      };
      localStorage.setItem("cortex_token", data.access_token);
      if (typeof data.refresh_token === "string" && data.refresh_token.length > 0) {
        localStorage.setItem("cortex_refresh_token", data.refresh_token);
      }
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
      navigate("/learning", { replace: true });
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
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 20 }}>
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

        {bannerError && (
          <div
            style={{
              background: "var(--red-soft)",
              border: "1px solid color-mix(in srgb, var(--red) 40%, transparent)",
              color: "var(--tone-critical-fg)",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {bannerError}
          </div>
        )}

        <Field label="Invite token (optional)" error={errors.invite_token}>
          <input
            value={form.invite_token}
            onChange={(e) => setField("invite_token", e.target.value)}
            placeholder="Paste a token from your admin to join their org"
            style={inputStyle}
          />
        </Field>

        {!form.invite_token.trim() ? (
          <>
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
          </>
        ) : null}

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
          {loading
            ? form.invite_token.trim()
              ? "Joining organisation..."
              : "Creating account..."
            : form.invite_token.trim()
              ? "Join organisation →"
              : "Create Account →"}
        </button>

        <p style={{ marginTop: 16, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--cyan)", textDecoration: "none" }}>
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
        <div style={{ color: "var(--red)", fontSize: 11, marginTop: 4 }}>{error}</div>
      ) : null}
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  color: "var(--text-secondary)",
  fontSize: 12,
  marginBottom: 6,
  fontFamily: "var(--font-mono)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: 14,
  boxSizing: "border-box",
};

function submitStyle(disabled: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 8,
    background: disabled
      ? "var(--elevated)"
      : "linear-gradient(135deg, color-mix(in srgb, var(--blue) 90%, black), var(--blue))",
    border: "none",
    color: "var(--text)",
    fontSize: 14,
    fontWeight: "bold",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.8 : 1,
  };
}
