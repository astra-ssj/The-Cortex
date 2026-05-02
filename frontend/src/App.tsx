import { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { getToken, getUser, ALL_FRAMEWORK_IDS } from "./api/client";
import { LogoFull } from "./components/Logo";
import Login from "./pages/Login";
import { DemoToggle } from "./components/DemoToggle";
import { useOrgContext } from "./hooks/useOrgContext";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import { ComplianceDashboard } from "./ComplianceDashboard";
import { GroupDashboard } from "./components/GroupDashboard";
import { RemediationTracker } from "./RemediationTracker";
import { HumanReview } from "./HumanReview";
import { AuditReport } from "./components/AuditReport";
import { Integrations } from "./components/Integrations";
import { ProjectTracker } from "./ProjectTracker";
import { FrameworkDetailPage } from "./FrameworkDetailPage";
import { useAssessmentStream } from "./store/complianceStore";
import Intelligence from "./pages/Intelligence";
import CloudScans from "./pages/CloudScans";
import AISystems from "./pages/AISystems";
import { HelpPanel } from "./components/HelpPanel";
import { clearCortexBrowserSession } from "./lib/cortexSession";
import { PrimaryNav } from "./components/PrimaryNav";

/** Optional production/staging label from env; falls back to DEV when running Vite dev server. */
function DeployEnvBadge() {
  const custom = import.meta.env.VITE_CORTEX_DEPLOY_LABEL?.trim();
  const label = custom || (import.meta.env.DEV ? "DEV" : "");
  if (!label) return null;
  const isDev = !custom && import.meta.env.DEV;
  return (
    <span
      title={isDev ? "Development build" : "Deployment label from VITE_CORTEX_DEPLOY_LABEL"}
      style={{
        marginLeft: 6,
        padding: "2px 8px",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--text-micro)",
        fontWeight: 700,
        letterSpacing: "0.06em",
        background: isDev ? "rgba(245, 158, 11, 0.15)" : "rgba(59, 130, 246, 0.15)",
        border: `1px solid ${isDev ? "rgba(245, 158, 11, 0.45)" : "rgba(59, 130, 246, 0.35)"}`,
        color: isDev ? "#fbbf24" : "#93c5fd",
      }}
    >
      {label.toUpperCase()}
    </span>
  );
}

function HeaderTrustStrip({ orgId, demoMode }: { orgId: string; demoMode: boolean }) {
  const company =
    typeof window !== "undefined" ? (localStorage.getItem("cortex_company") ?? "").trim() : "";
  const showCompany = Boolean(company) && !demoMode;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        flexWrap: "wrap",
        maxWidth: "min(420px, 42vw)",
      }}
      title="Effective organisation scope for API requests (Demo toggle may show reference tenant while JWT stays yours)."
    >
      <span className="cortex-text-mono" style={{ fontSize: "var(--text-micro)", color: "var(--dim)" }}>
        Org <span style={{ color: "var(--muted)" }}>{orgId}</span>
      </span>
      {demoMode && (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-micro)",
            fontWeight: 700,
            letterSpacing: "0.04em",
            background: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            color: "#fbbf24",
          }}
        >
          DEMO DATA VIEW
        </span>
      )}
      {showCompany && (
        <span
          style={{
            fontSize: "var(--text-micro)",
            color: "var(--dim)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 160,
          }}
          title={company}
        >
          {company}
        </span>
      )}
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="cortex-text-mono" style={{ color: "#4a5a72", fontSize: "13px" }}>
      {time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

function HeaderShell({
  user,
  onLogout,
  onOpenHelp,
}: {
  user: { name?: string; username?: string; [key: string]: unknown } | null;
  onLogout: () => void;
  onOpenHelp: () => void;
}) {
  const navigate = useNavigate();
  const { orgId, demoMode } = useOrgContext();
  const { isStreaming, startStream } = useAssessmentStream();

  const handleRunAssessment = () => {
    startStream(orgId, ALL_FRAMEWORK_IDS.split(","));
    navigate("/dashboard");
  };

  return (
    <>
      <header className="cortex-header" aria-label="Application header">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
          <LogoFull size="md" />
          <span style={{ color: "var(--sep)" }} aria-hidden>
            ·
          </span>
          <div className="cortex-monitor-live flex items-center gap-1.5" title="Live monitoring status">
            <span className="cortex-monitor-dot" aria-hidden />
            <span style={{ color: "var(--green)", fontSize: "11px", fontWeight: 700 }}>MONITORING</span>
          </div>
          <span style={{ color: "var(--sep)" }} aria-hidden>
            ·
          </span>
          <LiveClock />
          <span style={{ color: "var(--sep)" }} aria-hidden>
            ·
          </span>
          <HeaderTrustStrip orgId={orgId} demoMode={demoMode} />
          <DeployEnvBadge />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexShrink: 0 }}>
          <DemoToggle />
          {user && (
            <span className="cortex-text-caption" style={{ color: "#4a5a72" }}>
              {(user as { name?: string }).name ??
                (user as { username?: string }).username ??
                (user as { email?: string }).email ??
                "User"}
            </span>
          )}
          <button type="button" onClick={onLogout} className="cortex-btn-ghost">
            Logout
          </button>
        </div>
      </header>

      <nav className="cortex-nav" aria-label="Primary">
        <div className="cortex-nav-primary">
          <PrimaryNav />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
            paddingLeft: "var(--space-2)",
            borderLeft: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={handleRunAssessment}
            disabled={isStreaming}
            className="cortex-btn-primary"
          >
            {isStreaming ? "Streaming…" : "Run Assessment"}
          </button>
          <button
            type="button"
            onClick={onOpenHelp}
            className="cortex-btn-icon"
            aria-label="Open help panel"
            title="Help (keyboard shortcut H)"
          >
            ?
          </button>
        </div>
      </nav>
    </>
  );
}

function MainChrome({ onOpenHelp }: { onOpenHelp: () => void }) {
  const [user, setUser] = useState(() => getUser());
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
    };
    window.addEventListener("cortex:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("cortex:auth-expired", handleAuthExpired);
  }, []);

  const onLogout = () => {
    clearCortexBrowserSession();
    setUser(null);
    navigate("/login", { replace: true });
  };

  return (
    <div className="cortex-app">
      <a href="#main-content" className="cortex-skip-link">
        Skip to main content
      </a>
      <HeaderShell user={user} onLogout={onLogout} onOpenHelp={onOpenHelp} />
      <main id="main-content" tabIndex={-1} aria-label="Main content">
        <Outlet />
      </main>
    </div>
  );
}

function AuthGate() {
  const token = getToken();
  const loc = useLocation();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  const onboardingRaw = localStorage.getItem("cortex_onboarding");
  const onboardingState = onboardingRaw
    ? (JSON.parse(onboardingRaw) as { complete?: boolean })
    : null;
  const needsOnboarding = onboardingState?.complete === false;
  if (needsOnboarding && loc.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  if (!needsOnboarding && loc.pathname === "/onboarding") {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

function RootRedirect() {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  const onboardingRaw = localStorage.getItem("cortex_onboarding");
  const onboardingState = onboardingRaw
    ? (JSON.parse(onboardingRaw) as { complete?: boolean })
    : null;
  if (onboardingState?.complete === false) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

function LoginScreen() {
  const navigate = useNavigate();
  if (getToken()) {
    const onboardingRaw = localStorage.getItem("cortex_onboarding");
    const onboardingState = onboardingRaw
      ? (JSON.parse(onboardingRaw) as { complete?: boolean })
      : null;
    if (onboardingState?.complete === false) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  return (
    <Login
      onSuccess={(_token, user) => {
        const u = user as { onboarding_complete?: boolean };
        if (u.onboarding_complete === false) {
          navigate("/onboarding", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      }}
    />
  );
}

function AppRoutes() {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === "Escape") {
        setHelpOpen(false);
        return;
      }
      switch (e.key.toLowerCase()) {
        case "d":
          navigate("/dashboard");
          break;
        case "g":
          navigate("/group");
          break;
        case "c":
          navigate("/cloud-scans");
          break;
        case "i":
          navigate("/intelligence");
          break;
        case "a":
          navigate("/ai-systems");
          break;
        case "r":
          navigate("/review-queue");
          break;
        case "h":
          setHelpOpen(true);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navigate]);

  return (
    <>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<Register />} />
        <Route element={<AuthGate />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<MainChrome onOpenHelp={() => setHelpOpen(true)} />}>
            <Route path="/dashboard" element={<ComplianceDashboard />} />
            <Route path="/group" element={<GroupDashboard />} />
            <Route path="/frameworks" element={<ComplianceDashboard />} />
            <Route path="/frameworks/:id" element={<FrameworkDetailPage />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/ai-systems" element={<AISystems />} />
            <Route path="/review-queue" element={<HumanReview />} />
            <Route path="/audit-report" element={<AuditReport />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/cloud-scans" element={<CloudScans />} />
            <Route path="/roadmap" element={<ProjectTracker />} />
            <Route path="/evidence" element={<RemediationTracker />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AppRoutes />
    </BrowserRouter>
  );
}
