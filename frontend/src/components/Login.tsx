import { useState } from "react";
import type { AuthUser } from "../auth";

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? "" : "http://localhost:8000");

interface LoginProps {
  onSuccess: (token: string, user: AuthUser) => void;
}

export function Login({ onSuccess }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const timeoutMs = 10_000;
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const body = new URLSearchParams({ username: email, password });
      const res = await fetch(`${API_BASE}/api/v1/auth/token`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: ac.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
        throw new Error(typeof detail === "string" ? detail : "Invalid email or password");
      }
      const data = await res.json();
      const user: AuthUser = {
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        entity: data.user.entity,
      };
      onSuccess(data.access_token, user);
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          setError("Connection failed. Is the server running?");
        } else {
          setError(err.message);
        }
      } else {
        setError("Connection failed. Is the server running?");
      }
      setPassword("");
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05080f] px-4">
      <div className="w-full max-w-[400px]">
        <div className="rounded-xl border border-cortex-border bg-cortex-surface p-8 shadow-2xl">
          <div className="mb-6 flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cortex-blue to-cortex-purple font-data text-2xl font-semibold text-white shadow-lg">
              C
            </div>
            <span className="font-ui text-2xl font-semibold text-cortex-text">CORTEX</span>
            <p className="font-ui text-sm text-cortex-muted">Organisational Intelligence Platform</p>
          </div>
          <div className="mb-6 rounded border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-center font-ui text-xs font-medium uppercase tracking-wider text-amber-400">
            CONFIDENTIAL — Authorised Access Only
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="mb-1 block font-ui text-sm font-medium text-cortex-muted">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-cortex-border bg-cortex-panel px-4 py-2.5 font-ui text-cortex-text placeholder:text-cortex-muted focus:border-cortex-blue focus:outline-none focus:ring-1 focus:ring-cortex-blue"
                placeholder="you@astralabs.com"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block font-ui text-sm font-medium text-cortex-muted">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-cortex-border bg-cortex-panel px-4 py-2.5 pr-10 font-ui text-cortex-text placeholder:text-cortex-muted focus:border-cortex-blue focus:outline-none focus:ring-1 focus:ring-cortex-blue"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 font-ui text-xs text-cortex-muted hover:text-cortex-text"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {error && (
              <p className="rounded border border-cortex-red/50 bg-cortex-red/10 px-3 py-2 font-ui text-sm text-cortex-red">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gradient-to-r from-cortex-blue to-cortex-blue/90 px-4 py-3 font-ui text-sm font-semibold text-white shadow-lg transition hover:from-cortex-blue/95 hover:to-cortex-blue/85 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <p className="mt-6 text-center font-ui text-xs text-cortex-muted">
            Demo: ciso@astralabs.com / cortex-ciso-2026
          </p>
        </div>
      </div>
    </div>
  );
}
