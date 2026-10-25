import { useState, type FormEvent, type ReactNode } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LogoIcon, LogoWordmark } from "../components/Logo";
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setBannerError("");
    if (Object.keys(nextErrors).length > 0) {
      const first = Object.keys(nextErrors)[0];
      document.getElementById(`register-${first}`)?.focus();
      return;
    }

    setLoading(true);
    try {
      const joining = Boolean(form.invite_token.trim());
      const response = await fetch(
        joining ? "/api/v1/auth/accept-invite" : "/api/v1/auth/register",
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
      navigate("/onboarding", { replace: true });
    } catch (error) {
      setBannerError(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
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
        className="cortex-auth-card"
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
          <LogoWordmark fontSize={24} />
          <h1 style={{ margin: 0, fontSize: 20 }}>Create your Astra GRC account</h1>
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
            Competence you can evidence.
          </span>
        </div>

        {bannerError && (
          <div
            role="alert"
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

        <form onSubmit={handleSubmit} noValidate>
        <Field id="register-invite_token" label="Invite token (optional)" error={errors.invite_token}>
          <input
            id="register-invite_token"
            value={form.invite_token}
            onChange={(e) => setField("invite_token", e.target.value)}
            placeholder="Paste a token from your admin to join their org"
            style={inputStyle}
            aria-invalid={Boolean(errors.invite_token)}
            aria-describedby={errors.invite_token ? "register-invite_token-error" : undefined}
          />
        </Field>

        {!form.invite_token.trim() ? (
          <>
            <Field id="register-company_name" label="Company Name" error={errors.company_name}>
              <input
                id="register-company_name"
                value={form.company_name}
                onChange={(e) => setField("company_name", e.target.value)}
                placeholder="AstraLabs GmbH"
                style={inputStyle}
                aria-invalid={Boolean(errors.company_name)}
                aria-describedby={errors.company_name ? "register-company_name-error" : undefined}
              />
            </Field>

            <Field id="register-jurisdiction" label="Jurisdiction" error={errors.jurisdiction}>
              <select id="register-jurisdiction" value={form.jurisdiction} onChange={(e) => setField("jurisdiction", e.target.value)} style={inputStyle}>
                {JURIS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="register-industry" label="Industry" error={errors.industry}>
              <select id="register-industry" value={form.industry} onChange={(e) => setField("industry", e.target.value)} style={inputStyle}>
                {INDUSTRY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}

        <Field id="register-full_name" label="Full Name" error={errors.full_name}>
          <input
            id="register-full_name"
            value={form.full_name}
            onChange={(e) => setField("full_name", e.target.value)}
            placeholder="Jane Smith"
            style={inputStyle}
            aria-invalid={Boolean(errors.full_name)}
            aria-describedby={errors.full_name ? "register-full_name-error" : undefined}
          />
        </Field>

        <Field id="register-email" label="Work Email" error={errors.email}>
          <input
            id="register-email"
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            placeholder="ciso@company.com"
            style={inputStyle}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "register-email-error" : undefined}
            autoComplete="email"
          />
        </Field>

        <Field id="register-password" label="Password" error={errors.password}>
          <input
            id="register-password"
            type="password"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            placeholder="Min. 8 characters"
            style={inputStyle}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "register-password-error" : undefined}
            autoComplete="new-password"
          />
        </Field>

        <Field id="register-confirmPassword" label="Confirm Password" error={errors.confirmPassword}>
          <input
            id="register-confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setField("confirmPassword", e.target.value)}
            placeholder="Repeat password"
            style={inputStyle}
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={errors.confirmPassword ? "register-confirmPassword-error" : undefined}
            autoComplete="new-password"
          />
        </Field>

        <button type="submit" disabled={loading} style={submitStyle(loading)} aria-busy={loading}>
          {loading
            ? form.invite_token.trim()
              ? "Joining organisation..."
              : "Creating account..."
            : form.invite_token.trim()
              ? "Join organisation →"
              : "Create Account →"}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {loading ? "Registration in progress" : ""}
        </span>
        </form>

        <p style={{ marginTop: 16, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--cyan)", textDecoration: "underline" }}>
            Sign in →
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      {children}
      {error ? (
        <div id={`${id}-error`} role="alert" style={{ color: "var(--red)", fontSize: 11, marginTop: 4 }}>{error}</div>
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
    background: disabled ? "var(--elevated)" : "var(--blue)",
    border: "none",
    color: "var(--on-accent)",
    fontSize: 14,
    fontWeight: "bold",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.8 : 1,
  };
}
