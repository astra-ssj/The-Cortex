import { useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ComplianceDashboard } from "./ComplianceDashboard";
import { FrameworkDetailPage } from "./FrameworkDetailPage";
import { ProjectTracker } from "./ProjectTracker";
import RemediationTracker from "./components/RemediationTracker";
import AuditReportPage from "./components/AuditReportPage";
import HumanReview from "./components/HumanReview";
import { Login } from "./components/Login";
import { DEFAULT_ORG_ID, ALL_FRAMEWORK_IDS } from "./api/client";
import { useAssessmentStream } from "./store/complianceStore";

const navItems = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Frameworks", path: "/frameworks" },
  { label: "Review Queue", path: "/review-queue" },
  { label: "Audit Report", path: "/audit-report" },
  { label: "Roadmap", path: "/roadmap" },
];

function formatClock(): string {
  const d = new Date();
  const time = d.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${time} · ${date}`;
}

function Header({ user: _user, onLogout }: { user: { username?: string; [key: string]: unknown } | null; onLogout: () => void }) {
  const [clock, setClock] = useState(formatClock());
  const { isStreaming, startStream, stopStream } = useAssessmentStream();
  const location = useLocation();

  useEffect(() => {
    const id = setInterval(() => setClock(formatClock()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-cortex-border bg-cortex-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1920px] items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-gradient-to-br from-cortex-blue to-cortex-purple font-data text-lg font-semibold text-white shadow-lg">
              C
            </div>
            <span className="font-ui text-xl font-semibold text-cortex-text">CORTEX</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(({ path, label }) => (
              <Link
                key={path}
                to={path}
                style={{
                  color: location.pathname === path ? "#e2e8f4" : "#4a5a72",
                  fontWeight: location.pathname === path ? "bold" : "normal",
                  textDecoration: "none",
                  padding: "0 12px",
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-md border border-cortex-border bg-cortex-panel px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cortex-green opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cortex-green" />
            </span>
            <span className="font-data text-xs font-medium uppercase tracking-wider text-cortex-green">Monitoring</span>
          </div>
          <span className="font-data text-sm text-cortex-muted">{clock}</span>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-cortex-border bg-cortex-panel px-4 py-2 font-ui text-sm font-medium text-cortex-muted transition hover:bg-cortex-border hover:text-cortex-text"
          >
            Logout
          </button>
          <button
            type="button"
            onClick={() => (isStreaming ? stopStream() : startStream(DEFAULT_ORG_ID, ALL_FRAMEWORK_IDS.split(",")))}
            disabled={isStreaming}
            className="rounded-lg bg-gradient-to-r from-cortex-blue to-cortex-blue/90 px-4 py-2 font-ui text-sm font-semibold text-white shadow-lg transition hover:from-cortex-blue/95 hover:to-cortex-blue/85 disabled:opacity-60"
          >
            {isStreaming ? "Streaming…" : "Run Assessment"}
          </button>
        </div>
      </div>
    </header>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("cortex_token"));
  const [_user, setUser] = useState<{ username?: string; [key: string]: unknown } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("cortex_user") ?? "null");
    } catch {
      return null;
    }
  });

  function handleLogout() {
    localStorage.removeItem("cortex_token");
    localStorage.removeItem("cortex_user");
    setToken(null);
    setUser(null);
  }

  function handleLoginSuccess() {
    setToken(localStorage.getItem("cortex_token"));
    try {
      setUser(JSON.parse(localStorage.getItem("cortex_user") ?? "null"));
    } catch {
      setUser(null);
    }
  }

  if (!token) {
    return <Login onSuccess={handleLoginSuccess} />;
  }

  const user = _user;
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-cortex-bg font-ui text-cortex-text">
        <>
          <Header user={user} onLogout={handleLogout} />
          <main className="mx-auto max-w-[1920px] px-6 py-6">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<ComplianceDashboard token={token} />} />
              <Route path="/frameworks" element={<ComplianceDashboard token={token} />} />
              <Route path="/evidence" element={<RemediationTracker token={token} />} />
              <Route path="/review-queue" element={<HumanReview token={token} />} />
              <Route path="/audit-report" element={<AuditReportPage token={token} />} />
              <Route path="/roadmap" element={<ProjectTracker />} />
              <Route path="/frameworks/:id" element={<FrameworkDetailPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </>
      </div>
    </BrowserRouter>
  );
}

export default App;
