import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
} from "react-router-dom";
import { getToken, getUser, revokeCurrentSession } from "./api/client";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import { ComplianceDashboard } from "./pages/ComplianceDashboard";
import { GroupDashboard } from "./components/GroupDashboard";
import { RemediationTracker } from "./pages/RemediationTracker";
import { HumanReview } from "./pages/HumanReview";
import { ProjectTracker } from "./pages/ProjectTracker";
import { FrameworkDetailPage } from "./pages/FrameworkDetailPage";
import { HelpPanel } from "./components/HelpPanel";
import { logoutCortexBrowserSession } from "./lib/cortexSession";
import { Sidebar, SIDEBAR_WIDTH_PX } from "./components/Sidebar";
import { AssessmentStreamProvider } from "./store/assessmentStream";
import { WelcomeTour } from "./components/WelcomeTour";
import { isWelcomeTourBlockingShortcuts } from "./lib/welcomeTour";
import { TopBar } from "./components/TopBar";
import { CommandPalette } from "./components/CommandPalette";
import Settings from "./pages/Settings";
import { FrameworksList } from "./pages/FrameworksList";
import FindingDetail from "./pages/FindingDetail";
import EvidenceVault from "./pages/EvidenceVault";
import HelpDocs from "./pages/HelpDocs";
import LearningLoop from "./pages/LearningLoop";
import AuditSimulator from "./pages/AuditSimulator";
import CompetencyHistory from "./pages/CompetencyHistory";
import TeamCompetencyLedger from "./pages/TeamCompetencyLedger";

function MainChrome() {
  const [user, setUser] = useState(() => getUser() as Record<string, unknown> | null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
    };
    window.addEventListener("cortex:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("cortex:auth-expired", handleAuthExpired);
  }, []);

  const onLogout = async () => {
    await logoutCortexBrowserSession(queryClient, revokeCurrentSession);
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
      <WelcomeTour />
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
  return <Outlet />;
}

function RootRedirect() {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/audit-simulator" replace />;
}

function LoginScreen() {
  const navigate = useNavigate();
  if (getToken()) {
    return <Navigate to="/audit-simulator" replace />;
  }
  return (
    <Login
      onSuccess={() => {
        navigate("/audit-simulator", { replace: true });
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
      if (isWelcomeTourBlockingShortcuts()) {
        return;
      }
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
          navigate("/audit-simulator");
          break;
        case "i":
          navigate("/audit-simulator");
          break;
        case "r":
          navigate("/review-queue");
          break;
        case "s":
          navigate("/settings");
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

  useEffect(() => {
    const openPalette = () => setCommandOpen(true);
    window.addEventListener("cortex:open-command-palette", openPalette);
    return () => window.removeEventListener("cortex:open-command-palette", openPalette);
  }, []);

  return (
    // Wraps the palette as well as the routes: it can start a run, and the page
    // it navigates to has to be looking at that same stream.
    <AssessmentStreamProvider>
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
            <Route path="/intelligence" element={<Navigate to="/audit-simulator" replace />} />
            <Route path="/intelligence/:tab" element={<Navigate to="/audit-simulator" replace />} />
            <Route path="/review-queue" element={<HumanReview />} />
            <Route path="/roadmap" element={<ProjectTracker />} />
            <Route path="/evidence" element={<EvidenceVault />} />
            <Route path="/findings" element={<RemediationTracker />} />
            <Route path="/remediation" element={<RemediationTracker />} />
            <Route path="/findings/:id" element={<FindingDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/learning" element={<LearningLoop />} />
            <Route path="/audit-simulator" element={<AuditSimulator />} />
            <Route path="/progress" element={<CompetencyHistory />} />
            <Route path="/team" element={<TeamCompetencyLedger />} />
            <Route path="/help" element={<HelpDocs />} />
            <Route path="*" element={<Navigate to="/audit-simulator" replace />} />
          </Route>
        </Route>
      </Routes>
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </AssessmentStreamProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}