import { useState, useEffect } from "react";
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
import Login from "./components/Login";
import { DemoToggle } from "./components/DemoToggle";
import { OrgScopeProvider, useOrgContext } from "./hooks/useOrgContext";
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

const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Group", path: "/group" },
  { label: "Frameworks", path: "/frameworks" },
  { label: "Review Queue", path: "/review-queue" },
  { label: "Audit Report", path: "/audit-report" },
  { label: "Integrations", path: "/integrations" },
  { label: "Roadmap", path: "/roadmap" },
];

function HeaderShell({
  user,
  onLogout,
}: {
  user: { name?: string; username?: string; [key: string]: unknown } | null;
  onLogout: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { orgId } = useOrgContext();
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
          {NAV_ITEMS.map((item, i) => (
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
                  fontWeight: location.pathname === item.path ? "bold" : "normal",
                  color: location.pathname === item.path ? "#e2e8f4" : "#4a5a72",
                  background: location.pathname === item.path ? "#141e30" : "transparent",
                }}
              >
                {item.label}
              </Link>
            </span>
          ))}
        </div>
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
      </nav>
    </>
  );
}

function MainChrome() {
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
    localStorage.removeItem("cortex_token");
    localStorage.removeItem("cortex_user");
    localStorage.removeItem("cortex_org_id");
    localStorage.removeItem("cortex_demo_mode");
    localStorage.removeItem("cortex_jurisdiction");
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
      <HeaderShell user={user} onLogout={onLogout} />
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
  const u = getUser() as Record<string, unknown> | null;
  const needsOnboarding = u?.onboarding_complete === false;
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
  const u = getUser() as Record<string, unknown> | null;
  if (u?.onboarding_complete === false) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

function LoginScreen() {
  const navigate = useNavigate();
  if (getToken()) {
    const u = getUser() as Record<string, unknown> | null;
    if (u?.onboarding_complete === false) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  return (
    <Login
      onSuccess={() => {
        const u = getUser() as Record<string, unknown> | null;
        if (u?.onboarding_complete === false) {
          navigate("/onboarding", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      }}
    />
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
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<Register />} />
        <Route element={<AuthGate />}>
          <Route
            path="/onboarding"
            element={
              <OrgScopeProvider>
                <Onboarding />
              </OrgScopeProvider>
            }
          />
          <Route
            element={
              <OrgScopeProvider>
                <MainChrome />
              </OrgScopeProvider>
            }
          >
            <Route path="/dashboard" element={<ComplianceDashboard />} />
            <Route path="/group" element={<GroupDashboard />} />
            <Route path="/frameworks" element={<ComplianceDashboard />} />
            <Route path="/frameworks/:id" element={<FrameworkDetailPage />} />
            <Route path="/review-queue" element={<HumanReview />} />
            <Route path="/audit-report" element={<AuditReport />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/roadmap" element={<ProjectTracker />} />
            <Route path="/evidence" element={<RemediationTracker />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
