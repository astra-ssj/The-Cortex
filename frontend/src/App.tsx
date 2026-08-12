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
import { getToken, getUser } from "./api/client";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import { ComplianceDashboard } from "./pages/ComplianceDashboard";
import { GroupDashboard } from "./components/GroupDashboard";
import { RemediationTracker } from "./pages/RemediationTracker";
import { HumanReview } from "./pages/HumanReview";
import { AuditReport } from "./components/AuditReport";
import { ProjectTracker } from "./pages/ProjectTracker";
import { FrameworkDetailPage } from "./pages/FrameworkDetailPage";
import Intelligence from "./pages/Intelligence";
import AISystems from "./pages/AISystems";
import { HelpPanel } from "./components/HelpPanel";
import { clearCortexBrowserSession } from "./lib/cortexSession";
import { Sidebar, SIDEBAR_WIDTH_PX } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { CommandPalette } from "./components/CommandPalette";
import Settings from "./pages/Settings";
import { FrameworksList } from "./pages/FrameworksList";
import FindingDetail from "./pages/FindingDetail";
import EvidenceVault from "./pages/EvidenceVault";
import HelpDocs from "./pages/HelpDocs";
import LearningLoop from "./pages/LearningLoop";

function MainChrome() {
  const [user, setUser] = useState(() => getUser() as Record<string, unknown> | null);
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

  const mainPad = { padding: "0 28px 40px", minHeight: "100vh" as const };

  return (
    <div className="cortex-app">
      <a href="#main-content" className="cortex-skip-link">
        Skip to main content
      </a>
      <Sidebar user={user} onLogout={onLogout} />
      <main
        id="main-content"
        tabIndex={-1}
        aria-label="Main content"
        className="cortex-main-chrome"
        style={{ marginLeft: SIDEBAR_WIDTH_PX, ...mainPad }}
      >
        <TopBar />
        <Outlet />
      </main>
    </div>
  );
}

function AuthGate() {
  const loc = useLocation();
  const [authTick, setAuthTick] = useState(0);

  useEffect(() => {
    const onAuthChange = () => setAuthTick((n) => n + 1);
    window.addEventListener("cortex:auth-expired", onAuthChange);
    window.addEventListener("storage", onAuthChange);
    return () => {
      window.removeEventListener("cortex:auth-expired", onAuthChange);
      window.removeEventListener("storage", onAuthChange);
    };
  }, []);

  void authTick;
  const token = getToken();
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
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }
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
        case "i":
          navigate("/intelligence");
          break;
        case "a":
          navigate("/ai-systems");
          break;
        case "r":
          navigate("/review-queue");
          break;
        case "s":
          navigate("/settings");
          break;
        case "h":
          navigate("/help");
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navigate]);

  useEffect(() => {
    const openPalette = () => setCommandOpen(true);
    window.addEventListener("cortex:open-command-palette", openPalette);
    return () => window.removeEventListener("cortex:open-command-palette", openPalette);
  }, []);

  return (
    <>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<Register />} />
        <Route element={<AuthGate />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<MainChrome />}>
            <Route path="/dashboard" element={<ComplianceDashboard />} />
            <Route path="/group" element={<GroupDashboard />} />
            <Route path="/frameworks" element={<FrameworksList />} />
            <Route path="/frameworks/:id" element={<FrameworkDetailPage />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/intelligence/:tab" element={<Intelligence />} />
            <Route path="/ai-systems" element={<AISystems />} />
            <Route path="/review-queue" element={<HumanReview />} />
            <Route path="/audit-report" element={<AuditReport />} />
            <Route path="/roadmap" element={<ProjectTracker />} />
            <Route path="/evidence" element={<EvidenceVault />} />
            <Route path="/findings" element={<RemediationTracker />} />
            <Route path="/remediation" element={<RemediationTracker />} />
            <Route path="/findings/:id" element={<FindingDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/learning" element={<LearningLoop />} />
            <Route path="/help" element={<HelpDocs />} />
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