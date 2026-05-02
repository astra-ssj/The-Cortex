import { useState, useEffect, type ReactNode } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
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
        borderRadius: 4,
        fontSize: 10,
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
        gap: 8,
        flexWrap: "wrap",
        maxWidth: "min(420px, 42vw)",
      }}
      title="Effective organisation scope for API requests (Demo toggle may show reference tenant while JWT stays yours)."
    >
      <span
        style={{
          fontSize: 10,
          color: "#64748b",
          fontFamily: "'DM Mono', monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        Org <span style={{ color: "#94a3b8" }}>{orgId}</span>
      </span>
      {demoMode && (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 10,
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
            fontSize: 10,
            color: "#64748b",
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
    <span style={{ color: "#4a5a72", fontSize: "13px", fontFamily: "DM Mono, monospace" }}>
      {time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

const NAV_ITEMS: { label: ReactNode; path: string }[] = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Group", path: "/group" },
  { label: "Frameworks", path: "/frameworks" },
  { label: "Intelligence", path: "/intelligence" },
  { label: "AI Systems", path: "/ai-systems" },
  { label: "Review Queue", path: "/review-queue" },
  { label: "Remediation", path: "/evidence" },
  { label: "Audit Report", path: "/audit-report" },
  { label: "Integrations", path: "/integrations" },
  {
    label: (
      <>
        Cloud scans{" "}
        <span style={{ fontSize: 10, fontWeight: 600, color: "#5eead4" }}>Powered by Shasta</span>
      </>
    ),
    path: "/cloud-scans",
  },
  { label: "Roadmap", path: "/roadmap" },
];

/** Highlight Frameworks when viewing `/frameworks/:id` as well as the list route. */
function isPrimaryNavActive(navPath: string, pathname: string): boolean {
  if (navPath === "/frameworks") {
    return pathname === "/frameworks" || pathname.startsWith("/frameworks/");
  }
  return pathname === navPath;
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
  const location = useLocation();
  const navigate = useNavigate();
  const { orgId, demoMode } = useOrgContext();
  const { isStreaming, startStream } = useAssessmentStream();

  const handleRunAssessment = () => {
    startStream(orgId, ALL_FRAMEWORK_IDS.split(","));
    navigate("/dashboard");
  };

  return (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          height: "40px",
          background: "#090e1a",
          borderBottom: "1px solid #141e30",
          position: "sticky",
          top: 0,
          zIndex: 101,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <LogoFull size="md" />
          <span style={{ color: "#2d3a52", marginLeft: 4 }}>·</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#10b981",
                boxShadow: "0 0 6px #10b981",
              }}
            />
            <span style={{ color: "#10b981", fontSize: 11, fontWeight: "bold" }}>MONITORING</span>
          </div>
          <span style={{ color: "#2d3a52", marginLeft: 4 }}>·</span>
          <LiveClock />
          <span style={{ color: "#2d3a52", marginLeft: 4 }}>·</span>
          <HeaderTrustStrip orgId={orgId} demoMode={demoMode} />
          <DeployEnvBadge />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <DemoToggle />
          {user && (
            <span style={{ color: "#4a5a72", fontSize: 12 }}>
              {(user as { name?: string }).name ??
                (user as { username?: string }).username ??
                (user as { email?: string }).email ??
                "User"}
            </span>
          )}
          <button
            type="button"
            onClick={onLogout}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              background: "#141e30",
              border: "1px solid #1e2e48",
              color: "#94a3b8",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          height: "44px",
          background: "#0b1220",
          borderBottom: "1px solid #141e30",
          position: "sticky",
          top: 40,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {NAV_ITEMS.map((item, i) => {
            const active = isPrimaryNavActive(item.path, location.pathname);
            return (
            <span key={item.path} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && (
                <span style={{ color: "#2d3a52", margin: "0 6px", fontSize: 12 }}>|</span>
              )}
              <Link
                to={item.path}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  letterSpacing: 0,
                  textDecoration: "none",
                  fontWeight: active ? "bold" : "normal",
                  color: active ? "#e2e8f4" : "#4a5a72",
                  background: active ? "#141e30" : "transparent",
                }}
              >
                {item.label}
              </Link>
            </span>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={handleRunAssessment}
            disabled={isStreaming}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              background: "linear-gradient(135deg, #2563eb, #3b82f6)",
              border: "none",
              color: "#fff",
              fontSize: 12,
              fontWeight: "bold",
              cursor: isStreaming ? "not-allowed" : "pointer",
              opacity: isStreaming ? 0.7 : 1,
            }}
          >
            {isStreaming ? "Streaming…" : "Run Assessment"}
          </button>
          <button
            type="button"
            onClick={onOpenHelp}
            title="Help"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--border)",
              border: "1px solid var(--border-l)",
              color: "var(--muted)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Syne', sans-serif",
            }}
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
    <div
      style={{
        minHeight: "100vh",
        background: "#05080f",
        color: "#e2e8f4",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <HeaderShell user={user} onLogout={onLogout} onOpenHelp={onOpenHelp} />
      <main style={{ padding: "24px" }}>
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
