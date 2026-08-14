import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { LogoIcon } from "../components/Logo";
import { setStoredOrgId } from "../hooks/useOrgContext";

export interface LoginProps {
  onSuccess: (token: string, user: object) => void;
}

/** FastAPI may return ``detail`` as a string, object array (validation), or nested dict. */
function formatAuthErrorDetail(raw: unknown): string {
  if (raw == null) return "Login failed";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const parts = raw.map((x) =>
      typeof x === "object" && x !== null && "msg" in x
        ? String((x as { msg?: string }).msg)
        : JSON.stringify(x),
    );
    return parts.filter(Boolean).join("; ") || "Login failed";
  }
  if (typeof raw === "object" && raw !== null && "detail" in raw) {
    return formatAuthErrorDetail((raw as { detail: unknown }).detail);
  }
  return String(raw);
}

/** Standard envelope `{ error: { code, message } }` plus legacy ``detail``. */
function formatAuthErrorBody(payload: unknown): string {
  if (payload == null || typeof payload !== "object") return "Login failed";
  const o = payload as Record<string, unknown>;
  const nested = o.error;
  if (nested !== null && typeof nested === "object" && "message" in nested) {
    const m = (nested as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return formatAuthErrorDetail(o.detail ?? (o as { message?: unknown }).message);
}

export default function Login({ onSuccess }: LoginProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const form = new URLSearchParams();
      form.append("username", email);
      form.append("password", password);
      const base = import.meta.env.DEV ? "" : "http://localhost:8000";
      const res = await fetch(`${base}/api/v1/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        const msg = formatAuthErrorBody(e);
        throw new Error(
          msg || (res.status === 401 ? "Invalid email or password" : `HTTP ${res.status}`),
        );
      }
      const data = (await res.json()) as {
        access_token: string;
        refresh_token?: string;
        user?: Record<string, unknown>;
        org_id?: string;
        role?: string;
        is_demo?: boolean;
        onboarding_complete?: boolean;
        onboarding_step?: number;
      };
      const mergedUser: Record<string, unknown> = {
        ...(data.user ?? {}),
        org_id: data.org_id ?? data.user?.org_id,
        role: data.role ?? data.user?.role,
        is_demo: data.is_demo ?? data.user?.is_demo,
        onboarding_complete:
          data.onboarding_complete !== undefined
            ? data.onboarding_complete
            : (data.user?.onboarding_complete as boolean | undefined) ?? true,
        onboarding_step:
          data.onboarding_step ?? (data.user?.onboarding_step as number | undefined) ?? 3,
      };

      localStorage.setItem("cortex_token", data.access_token);
      if (typeof data.refresh_token === "string" && data.refresh_token.length > 0) {
        localStorage.setItem("cortex_refresh_token", data.refresh_token);
      } else {
        localStorage.removeItem("cortex_refresh_token");
      }
      localStorage.setItem("cortex_user", JSON.stringify(mergedUser));

      const orgId = (data.org_id ?? data.user?.org_id) as string | undefined;
      if (typeof orgId === "string") {
        setStoredOrgId(orgId);
      }

      localStorage.setItem(
        "cortex_onboarding",
        JSON.stringify({
          complete: Boolean(mergedUser.onboarding_complete),
          step: Number(mergedUser.onboarding_step ?? 1),
        })
      );

      if (orgId === "demo-org-001") {
        localStorage.setItem("cortex_demo_mode", "true");
      } else {
        localStorage.setItem("cortex_demo_mode", "false");
      }

      onSuccess(data.access_token, mergedUser);
    } catch (e: unknown) {
      if (e instanceof TypeError && /fetch|Load failed|NetworkError/i.test(e.message)) {
        setError(
          "Cannot reach the API. Start the backend (e.g. uvicorn on :8000) and use Vite dev so /api is proxied, or set the app to the same host as the API.",
        );
      } else {
        setError(e instanceof Error ? e.message : "Login failed");
      }
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
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 32,
          boxShadow: "var(--shadow-drop-lg)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            marginBottom: "8px",
          }}
        >
          <LogoIcon size={64} glow={true} />
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 800,
              fontSize: 28,
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
              letterSpacing: "3px",
              color: "var(--cyan)",
              textTransform: "uppercase",
            }}
          >
            Community Edition
          </span>
        </div>

        <form onSubmit={handleSubmit} noValidate>
        {error && (
          <div
            role="alert"
            aria-live="polite"
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
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="email" style={labelStyle}>
            Email
          </label>
          <input
            id="email"
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ciso@astralabs.com or admin"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label htmlFor="password" style={labelStyle}>
            Password
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ ...inputStyle, paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "var(--text-quiet)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 8,
            background: loading
              ? "var(--elevated)"
              : "linear-gradient(135deg, color-mix(in srgb, var(--blue) 90%, black), var(--blue))",
            border: "none",
            color: "var(--text)",
            fontSize: 14,
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.8 : 1,
          }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
        </form>

        <div style={{ marginTop: 18, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ color: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--font-mono)" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <p style={{ marginTop: 0, marginBottom: 10, color: "var(--text-quiet)", fontSize: 11, textAlign: "center" }}>
          New to CORTEX?
        </p>
        <button
          type="button"
          onClick={() => navigate("/register")}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 8,
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Create free account →
        </button>

        <p
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid var(--border)",
            color: "var(--text-tertiary)",
            fontSize: 10,
            lineHeight: 1.5,
            fontFamily: "var(--font-mono)",
          }}
        >
          Demo without legacy env: <strong style={{ color: "var(--text-secondary)" }}>ciso@astralabs.com</strong> /{" "}
          <strong style={{ color: "var(--text-secondary)" }}>cortex-ciso-2026</strong>. With Docker Compose,{" "}
          <strong style={{ color: "var(--text-secondary)" }}>admin</strong> /{" "}
          <strong style={{ color: "var(--text-secondary)" }}>admin</strong> also works (legacy demo password). Plain
          uvicorn: set{" "}
          <code style={{ color: "var(--text-tertiary)" }}>CORTEX_LEGACY_DEMO_PASSWORD=admin</code> or use the CISO demo
          above.
        </p>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  color: "var(--text-secondary)",
  fontSize: 12,
  marginBottom: 6,
} as const;

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: 14,
  boxSizing: "border-box" as const,
};
