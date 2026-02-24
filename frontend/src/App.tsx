import { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { getToken, getUser, DEFAULT_ORG_ID, ALL_FRAMEWORK_IDS } from "./api/client";
import Login from "./components/Login";
import { ComplianceDashboard } from "./ComplianceDashboard";
import { GroupDashboard } from "./components/GroupDashboard";
import { RemediationTracker } from "./RemediationTracker";
import { HumanReview } from "./HumanReview";
import { AuditReport } from "./components/AuditReport";
import { ProjectTracker } from "./ProjectTracker";
import { FrameworkDetailPage } from "./FrameworkDetailPage";
import { useAssessmentStream } from "./store/complianceStore";

// ── Clock component ──────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ color: "#4a5a72", fontSize: "13px", fontFamily: "DM Mono, monospace" }}>
      {time.toLocaleTimeString("en-GB", { hour12: false })}
      {" · "}
      {time.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}
    </span>
  );
}

// ── Navigation ───────────────────────────────────
const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Group", path: "/group" },
  { label: "Frameworks", path: "/frameworks" },
  { label: "Review Queue", path: "/review-queue" },
  { label: "Audit Report", path: "/audit-report" },
  { label: "Roadmap", path: "/roadmap" },
];

function Header({
  user,
  onLogout,
}: {
  user: { name?: string; username?: string; [key: string]: unknown } | null;
  onLogout: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isStreaming, startStream } = useAssessmentStream();

  const handleRunAssessment = () => {
    startStream(DEFAULT_ORG_ID, ALL_FRAMEWORK_IDS.split(","));
    navigate("/dashboard");
  };

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        height: "52px",
        background: "#090e1a",
        borderBottom: "1px solid #141e30",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
            color: "#fff",
            fontSize: 16,
          }}
        >
          C
        </div>
        <span
          style={{
            color: "#e2e8f4",
            fontWeight: "bold",
            fontSize: 16,
            letterSpacing: 1,
          }}
        >
          CORTEX
        </span>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", gap: 4 }}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: 13,
              textDecoration: "none",
              fontWeight: location.pathname === item.path ? "bold" : "normal",
              color: location.pathname === item.path ? "#e2e8f4" : "#4a5a72",
              background: location.pathname === item.path ? "#141e30" : "transparent",
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 6px #10b981",
            }}
          />
          <span style={{ color: "#10b981", fontSize: 12, fontWeight: "bold" }}>
            MONITORING
          </span>
        </div>
        <LiveClock />
        {user && (
          <span style={{ color: "#4a5a72", fontSize: 12 }}>
            {(user as { name?: string }).name ?? (user as { username?: string }).username ?? "User"}
          </span>
        )}
        <button
          type="button"
          onClick={onLogout}
          style={{
            padding: "6px 14px",
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
        <button
          type="button"
          onClick={handleRunAssessment}
          disabled={isStreaming}
          style={{
            padding: "6px 16px",
            borderRadius: 6,
            background: "linear-gradient(135deg, #2563eb, #3b82f6)",
            border: "none",
            color: "#fff",
            fontSize: 13,
            fontWeight: "bold",
            cursor: isStreaming ? "not-allowed" : "pointer",
            opacity: isStreaming ? 0.7 : 1,
          }}
        >
          {isStreaming ? "Streaming…" : "Run Assessment"}
        </button>
      </div>
    </header>
  );
}

// ── App ──────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState<string | null>(getToken());
  const [user, setUser] = useState<{ name?: string; username?: string; [key: string]: unknown } | null>(getUser());

  useEffect(() => {
    const handleAuthExpired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener("cortex:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("cortex:auth-expired", handleAuthExpired);
  }, []);

  const handleLoginSuccess = (newToken: string, newUser: object) => {
    setToken(newToken);
    setUser(newUser as { name?: string; username?: string; [key: string]: unknown });
  };

  const handleLogout = () => {
    localStorage.removeItem("cortex_token");
    localStorage.removeItem("cortex_user");
    setToken(null);
    setUser(null);
  };

  if (!token) {
    return <Login onSuccess={handleLoginSuccess} />;
  }

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <div
        style={{
          minHeight: "100vh",
          background: "#05080f",
          color: "#e2e8f4",
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        <Header user={user} onLogout={handleLogout} />
        <main style={{ padding: "24px" }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<ComplianceDashboard />} />
            <Route path="/group" element={<GroupDashboard />} />
            <Route path="/frameworks" element={<ComplianceDashboard />} />
            <Route path="/frameworks/:id" element={<FrameworkDetailPage />} />
            <Route path="/review-queue" element={<HumanReview />} />
            <Route path="/audit-report" element={<AuditReport />} />
            <Route path="/roadmap" element={<ProjectTracker />} />
            <Route path="/evidence" element={<RemediationTracker />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
