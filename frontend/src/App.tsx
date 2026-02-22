import { useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { ComplianceDashboard } from "./ComplianceDashboard";
import { FrameworkDetailPage } from "./FrameworkDetailPage";
import { HumanReview } from "./HumanReview";
import { ProjectTracker } from "./ProjectTracker";
import { RemediationTracker } from "./RemediationTracker";
import { DEFAULT_ORG_ID, ALL_FRAMEWORK_IDS } from "./api/client";
import { useAssessmentStream } from "./store/complianceStore";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/#frameworks", label: "Frameworks" },
  { to: "/review-queue", label: "Review Queue" },
  { to: "/remediation", label: "Remediation" },
  { to: "/roadmap", label: "Roadmap" },
];

function formatClock(): string {
  const d = new Date();
  const time = d.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${time} · ${date}`;
}

function Header() {
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
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-gradient-to-br from-cortex-blue to-cortex-purple font-data text-lg font-semibold text-white shadow-lg">
              C
            </div>
            <span className="font-ui text-xl font-semibold text-cortex-text">CORTEX</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`rounded px-3 py-2 text-sm font-medium transition ${
                  location.pathname === to
                    ? "bg-cortex-panel text-cortex-text"
                    : "text-cortex-muted hover:bg-cortex-panel hover:text-cortex-text"
                }`}
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
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-cortex-bg font-ui text-cortex-text">
        <Header />
        <main className="mx-auto max-w-[1920px] px-6 py-6">
          <Routes>
            <Route path="/" element={<ComplianceDashboard />} />
            <Route path="/review-queue" element={<HumanReview />} />
            <Route path="/remediation" element={<RemediationTracker />} />
            <Route path="/roadmap" element={<ProjectTracker />} />
            <Route path="/frameworks/:id" element={<FrameworkDetailPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
