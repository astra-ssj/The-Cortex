import { useState } from "react";
import { Link } from "react-router-dom";
import { LogoIcon } from "./Logo";

export interface LoginProps {
  onSuccess: (token: string, user: object) => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const form = new URLSearchParams();
      form.append("username", email);
      form.append("password", password);
      const base = import.meta.env.DEV ? "" : "http://localhost:8000";
      const res = await fetch(`${base}/api/v1/auth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { detail?: string }).detail || "Invalid credentials");
      }
      const data = (await res.json()) as {
        access_token: string;
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
          data.onboarding_step ?? (data.user?.onboarding_step as number | undefined) ?? 5,
      };
      localStorage.setItem("cortex_token", data.access_token);
      localStorage.setItem("cortex_user", JSON.stringify(mergedUser));
      if (typeof data.org_id === "string") {
        localStorage.setItem("cortex_org_id", data.org_id);
      }
      if (mergedUser.onboarding_complete === false) {
        localStorage.setItem("cortex_demo_mode", "false");
      }
      onSuccess(data.access_token, mergedUser);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Login failed"
      );
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
          maxWidth: 400,
          background: "#090e1a",
          border: "1px solid #141e30",
          borderRadius: 12,
          padding: 32,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            color: "#05080f",
            fontSize: 10,
            fontWeight: "bold",
            letterSpacing: 2,
            padding: "6px 12px",
            textAlign: "center",
            marginBottom: 24,
            borderRadius: 4,
          }}
        >
          CONFIDENTIAL
        </div>
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
              fontFamily: "'Syne', 'DM Sans', sans-serif",
              fontWeight: 800,
              fontSize: 28,
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
            Zero Trust AI Platform
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
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="email"
            style={{
              display: "block",
              color: "#94a3b8",
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            Email
          </label>
          <input
            id="email"
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="admin@astralabs.com or admin"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #141e30",
              background: "#0c1220",
              color: "#e2e8f4",
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label
            htmlFor="password"
            style={{
              display: "block",
              color: "#94a3b8",
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            Password
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "10px 12px",
                paddingRight: 40,
                borderRadius: 8,
                border: "1px solid #141e30",
                background: "#0c1220",
                color: "#e2e8f4",
                fontSize: 14,
                boxSizing: "border-box",
              }}
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
                color: "#4a5a72",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 8,
            background: loading
              ? "#1e2e48"
              : "linear-gradient(135deg, #2563eb, #3b82f6)",
            border: "none",
            color: "#fff",
            fontSize: 14,
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.8 : 1,
          }}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
        <p style={{ marginTop: 20, color: "#4a5a72", fontSize: 11, textAlign: "center" }}>
          <Link to="/register" style={{ color: "#2dd4bf", textDecoration: "none" }}>
            New to CORTEX? Create account →
          </Link>
        </p>
        <p style={{ marginTop: 12, color: "#4a5a72", fontSize: 11, textAlign: "center" }}>
          Seeded demo: admin@astralabs.com / admin (after DB migration) or ciso@astralabs.com per README.
        </p>
      </div>
    </div>
  );
}
