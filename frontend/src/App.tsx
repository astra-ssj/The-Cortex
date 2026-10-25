import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { getToken, getUser, revokeCurrentSession } from "./api/client";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import { logoutCortexBrowserSession } from "./lib/cortexSession";
import { Sidebar, SIDEBAR_WIDTH_PX } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import ScenarioStudio from "./pages/ScenarioStudio";
import Settings from "./pages/Settings";
import HelpDocs from "./pages/HelpDocs";
import LearningLoop from "./pages/LearningLoop";
import CompetencyHistory from "./pages/CompetencyHistory";
import TeamCompetencyLedger from "./pages/TeamCompetencyLedger";
import PracticeLibrary from "./pages/PracticeLibrary";
import InstructorDashboard from "./pages/InstructorDashboard";
import AssignmentDetail from "./pages/AssignmentDetail";

function MainChrome() {
  const [user, setUser] = useState(() => getUser() as Record<string, unknown> | null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
    };
    window.addEventListener("cortex:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("cortex:auth-expired", handleAuthExpired);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("main-content")?.focus({ preventScroll: true });
    });
  }, [pathname]);

  const closeMenu = (restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

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
      <button
        ref={menuButtonRef}
        type="button"
        className="cortex-mobile-menu"
        aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={menuOpen}
        aria-controls="primary-sidebar"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? "×" : "☰"}
      </button>
      <button
        type="button"
        className="cortex-sidebar-backdrop"
        data-open={menuOpen}
        aria-label="Close navigation menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => closeMenu(true)}
      />
      <Sidebar user={user} onLogout={onLogout} open={menuOpen} onNavigate={() => closeMenu()} />
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
  const user = getUser() as { onboarding_complete?: boolean } | null;
  return <Navigate to={user?.onboarding_complete === false ? "/onboarding" : "/practices"} replace />;
}

function LoginScreen() {
  const navigate = useNavigate();
  if (getToken()) {
    return <Navigate to="/practices" replace />;
  }
  return (
    <Login
      onSuccess={() => {
        const user = getUser() as { onboarding_complete?: boolean } | null;
        navigate(user?.onboarding_complete === false ? "/onboarding" : "/practices", { replace: true });
      }}
    />
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/register" element={<Register />} />
      <Route element={<AuthGate />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<MainChrome />}>
          <Route path="/practices" element={<PracticeLibrary />} />
          <Route path="/learning" element={<LearningLoop />} />
          <Route path="/progress" element={<CompetencyHistory />} />
          <Route path="/team" element={<TeamCompetencyLedger />} />
          <Route path="/instructor" element={<InstructorDashboard />} />
          <Route path="/instructor/assignments/:assignmentId" element={<AssignmentDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/scenarios/new" element={<ScenarioStudio />} />
          <Route path="/help" element={<HelpDocs />} />
          <Route path="*" element={<Navigate to="/practices" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}