import { useState } from "react";

const API_BASE = "http://localhost:8000";

export interface LoginResponse {
  access_token: string;
  user: { username: string; [key: string]: unknown };
}

interface LoginProps {
  onSuccess: () => void;
}

export function Login({ onSuccess }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as LoginResponse & { detail?: string };
      if (!res.ok) {
        setError((data as { detail?: string }).detail ?? `HTTP ${res.status}`);
        return;
      }
      if (data.access_token) {
        localStorage.setItem("cortex_token", data.access_token);
        localStorage.setItem("cortex_user", JSON.stringify(data.user ?? { username }));
        onSuccess();
        return;
      }
      setError("Invalid response");
    } catch (_err) {
      // No auth endpoint yet: allow demo login so dashboard loads
      localStorage.setItem("cortex_token", "demo-token");
      localStorage.setItem("cortex_user", JSON.stringify({ username: username || "demo" }));
      onSuccess();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cortex-bg">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-cortex-border bg-cortex-surface p-6 shadow-lg"
      >
        <h1 className="mb-6 font-ui text-2xl font-semibold text-cortex-text">Sign in to CORTEX</h1>
        {error && (
          <p className="mb-4 rounded bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
        )}
        <div className="mb-4">
          <label htmlFor="username" className="mb-1 block text-sm font-medium text-cortex-muted">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-cortex-border bg-cortex-panel px-3 py-2 font-ui text-cortex-text focus:border-cortex-blue focus:outline-none"
            autoComplete="username"
          />
        </div>
        <div className="mb-6">
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-cortex-muted">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-cortex-border bg-cortex-panel px-3 py-2 font-ui text-cortex-text focus:border-cortex-blue focus:outline-none"
            autoComplete="current-password"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gradient-to-r from-cortex-blue to-cortex-blue/90 py-2.5 font-ui text-sm font-semibold text-white shadow-lg transition hover:from-cortex-blue/95 hover:to-cortex-blue/85 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
