import { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { DemoToggle } from "./DemoToggle";
import { RunAssessmentModal } from "./RunAssessmentModal";
import { useOrgContext } from "../hooks/useOrgContext";
import { useRole } from "../hooks/useRole";
import { useFramework, useFrameworks } from "../hooks/useFrameworks";
import { useAssessmentStream, useCompliancePosture } from "../store/complianceStore";
import { Button } from "./ui/Button";
import { LlmProviderBadge } from "./LlmProviderBadge";

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="cortex-text-mono" style={{ color: "var(--text-quiet)", fontSize: "13px" }}>
      {time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/group": "Group View",
  "/frameworks": "Frameworks",
  "/findings": "Findings",
  "/remediation": "Remediation",
  "/evidence": "Evidence Vault",
  "/review-queue": "Review Queue",
  "/audit-report": "Audit Report",
  "/ai-systems": "AI Systems",
  "/intelligence": "Intelligence",
  "/intelligence/simulator": "Intelligence",
  "/roadmap": "Roadmap",
  "/settings": "Settings",
  "/help": "Help & Documentation",
};

function formatAssessed(iso: string | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TopBar() {
  const { pathname } = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const { orgId, demoMode } = useOrgContext();
  const { can } = useRole();
  const { data: posture } = useCompliancePosture(orgId);
  const { data: frameworks } = useFrameworks();
  const { isStreaming, startStream } = useAssessmentStream();
  const canRunAssessment = can("canRunAssessment");
  const [runModalOpen, setRunModalOpen] = useState(false);

  const frameworkId =
    pathname.startsWith("/frameworks/") && pathname !== "/frameworks"
      ? (params.id ?? null)
      : null;
  const { data: framework } = useFramework(frameworkId);

  const title = useMemo(() => {
    if (frameworkId) {
      return framework?.name ?? "Framework";
    }
    return ROUTE_TITLES[pathname] ?? "CORTEX";
  }, [frameworkId, framework?.name, pathname]);

  const subtitle = useMemo(() => {
    const orgName = posture?.organisationName?.trim() || "Organisation";
    const nFw = posture?.frameworks?.length ?? "—";
    const last = formatAssessed(posture?.lastAssessed ?? posture?.updatedAt);
    const demo = demoMode ? " · Demo data view" : "";
    return `${orgName} · ${nFw} frameworks · Last assessed ${last}${demo}`;
  }, [demoMode, posture?.frameworks?.length, posture?.lastAssessed, posture?.organisationName, posture?.updatedAt]);

  const modalFrameworks =
    frameworks?.map((f) => ({ id: f.id, name: f.name })) ?? null;

  return (
    <>
      <RunAssessmentModal
        open={runModalOpen}
        onClose={() => {
          setRunModalOpen(false);
        }}
        frameworks={modalFrameworks}
        disabled={isStreaming || !canRunAssessment}
        onConfirm={(ids) => {
          startStream(orgId, ids);
          navigate("/dashboard");
        }}
      />
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 24,
        padding: "24px 0 20px",
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap",
      }}
      aria-label="Page header"
    >
      <div style={{ minWidth: 0, flex: "1 1 240px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          {title}
        </h1>
        <p
          className="cortex-text-caption"
          style={{
            margin: "6px 0 0",
            color: "var(--text-tertiary)",
            maxWidth: 720,
          }}
        >
          {subtitle}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {can("canToggleDemo") ? <DemoToggle /> : null}
        <LlmProviderBadge />
        <LiveClock />
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => window.dispatchEvent(new Event("cortex:open-command-palette"))}
          title="Open command palette (Cmd/Ctrl + K)"
          aria-label="Open global search"
        >
          ⌕ Search
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={isStreaming || !canRunAssessment}
          title={!canRunAssessment ? "Admin or Analyst required" : undefined}
          onClick={() => {
            setRunModalOpen(true);
          }}
        >
          {isStreaming ? "Streaming…" : "Run Assessment"}
        </Button>
      </div>
    </header>
    </>
  );
}
