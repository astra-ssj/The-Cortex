import { NavLink, useLocation } from "react-router-dom";
import { LogoIcon, LogoWordmark } from "./Logo";
import { useOrgContext } from "../hooks/useOrgContext";
import {
  useCompliancePosture,
  useZtaipStatus,
} from "../store/complianceStore";
import { useReviewQueue } from "../api/client";
import { isPrimaryNavActive } from "../lib/navActive";
import { showNavSoonForPath } from "../lib/featureFlags";
import { Badge } from "./ui/Badge";
import { useRole } from "../hooks/useRole";
import { ROLE_LABELS } from "../lib/roles";

const SIDEBAR_W = 220;

export const SIDEBAR_WIDTH_PX = SIDEBAR_W;

type NavItem = {
  label: string;
  path: string;
  icon: string;
  badge?: "findings" | "review";
  soon?: boolean;
  tour?: string;
};

type NavGroupDef = { label: string; items: NavItem[]; tour?: string };

// Audit Simulator is the post-login landing page; Learning Loop is the session.
const NAV_GROUPS: NavGroupDef[] = [
  {
    label: "Train",
    tour: "train",
    items: [
      { label: "Audit Simulator", path: "/audit-simulator", icon: "▷", tour: "audit-simulator" },
      { label: "Learning Loop", path: "/learning", icon: "↻", tour: "learning" },
      { label: "My Progress", path: "/progress", icon: "▲" },
      { label: "Team Ledger", path: "/team", icon: "☰" },
    ],
  },
  {
    label: "Discover",
    tour: "discover",
    items: [
      { label: "Review Queue", path: "/review-queue", icon: "⇌", badge: "review" },
      { label: "Control Gaps", path: "/findings", icon: "⚑", badge: "findings" },
      { label: "Remediation Tracker", path: "/remediation", icon: "↻" },
    ],
  },
  {
    label: "Evidence",
    tour: "evidence",
    items: [
      { label: "Evidence Vault", path: "/evidence", icon: "▤" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Roadmap", path: "/roadmap", icon: "▸", soon: showNavSoonForPath("/roadmap") },
      { label: "Settings", path: "/settings", icon: "⚙" },
    ],
  },
];

function userInitials(user: Record<string, unknown> | null): string {
  if (!user) return "?";
  const name = String(
    (user.name as string | undefined) ??
      (user.username as string | undefined) ??
      (user.email as string | undefined) ??
      "?",
  ).trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.charAt(0) ?? "";
    const b = parts[1]?.charAt(0) ?? "";
    return `${a}${b}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function userDisplayName(user: Record<string, unknown> | null): string {
  if (!user) return "Signed out";
  return String(
    (user.name as string | undefined) ??
      (user.username as string | undefined) ??
      (user.email as string | undefined) ??
      "User",
  );
}

function ZtaipStatusPanel() {
  const { data: ztaip, isError, isPending } = useZtaipStatus();

  const auditLine = isPending ? "Checking…" : isError ? "Unavailable" : "Active";
  const auditOk = !isError && !isPending;
  const cbCount = ztaip?.circuitBreakersCount ?? 0;
  const cbOk = auditOk && cbCount === 0;
  const broker = ztaip?.sovereigntyBroker ?? "unavailable";
  const brokerOk = auditOk && broker === "active";

  const dot = (ok: boolean) => (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: ok ? "var(--green)" : "var(--amber)",
        boxShadow: ok
          ? "0 0 6px color-mix(in srgb, var(--green) 50%, transparent)"
          : "0 0 6px color-mix(in srgb, var(--amber) 45%, transparent)",
        flexShrink: 0,
      }}
    />
  );

  return (
    <div
      style={{
        padding: "12px 14px",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        fontSize: "11px",
        color: "var(--text-tertiary)",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 10,
          color: "var(--text-tertiary)",
        }}
      >
        ZTAIP System Status
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {dot(auditOk)}
          <span style={{ color: "var(--text-secondary)" }}>Audit Fabric: {auditLine}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {dot(cbOk)}
          <span style={{ color: "var(--text-secondary)" }}>
            Circuit Breakers: {isPending ? "…" : `${cbCount} tripped`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {dot(brokerOk)}
          <span style={{ color: "var(--text-secondary)" }}>
            Sovereignty Broker:{" "}
            {isPending
              ? "…"
              : broker === "active"
                ? "Active"
                : broker === "degraded"
                  ? "Degraded"
                  : "Unavailable"}
          </span>
        </div>
      </div>
    </div>
  );
}

function NavGroup({
  label,
  items,
  tour,
}: {
  label: string;
  items: NavItem[];
  tour?: string;
}) {
  const { orgId } = useOrgContext();
  const { pathname } = useLocation();
  const { data: posture } = useCompliancePosture(orgId);
  const { items: rqItems } = useReviewQueue(orgId);

  const findingsCount = posture?.criticalGapsCount ?? 0;
  const reviewCount = rqItems?.length ?? 0;

  return (
    <div style={{ marginBottom: 18 }} data-tour={tour}>
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
          paddingLeft: 16,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((item) => {
          const active = isPrimaryNavActive(item.path, pathname);
          const badgeCount =
            item.badge === "findings"
              ? findingsCount
              : item.badge === "review"
                ? reviewCount
                : null;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path !== "/frameworks"}
              aria-current={active ? "page" : undefined}
              className="cortex-sidebar-link"
              data-tour={item.tour}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: active ? 600 : 500,
                color: active ? "var(--text)" : "var(--text-secondary)",
                background: active ? "var(--blue-soft)" : "transparent",
                borderLeft: active ? "2px solid var(--blue)" : "2px solid transparent",
              }}
            >
              <span
                style={{
                  width: 22,
                  textAlign: "center",
                  fontSize: "14px",
                  color: active ? "var(--blue)" : "var(--text-tertiary)",
                }}
                aria-hidden
              >
                {item.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
              {item.soon ? (
                <Badge variant="neutral" size="xs">
                  Soon
                </Badge>
              ) : null}
              {badgeCount != null && badgeCount > 0 ? (
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    padding: "0 6px",
                    borderRadius: "var(--radius-pill)",
                    fontSize: "11px",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                      item.badge === "findings" ? "var(--red-soft)" : "var(--amber-soft)",
                    color: item.badge === "findings" ? "var(--red)" : "var(--amber)",
                  }}
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar({
  user,
  onLogout,
}: {
  user: Record<string, unknown> | null;
  onLogout: () => void;
}) {
  const { role, can } = useRole();
  const canSettings = can("canAccessSettings");
  const canTeam = can("canViewTeamCompetency");

  // Hide Settings and the org ledger when the role lacks access.
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => {
      if (it.path === "/settings") return canSettings;
      if (it.path === "/team") return canTeam;
      return true;
    }),
  }));

  return (
    <aside
      className="cortex-sidebar"
      style={{
        width: SIDEBAR_W,
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 10,
        height: "100vh",
        background: "var(--sidebar)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
      aria-label="Primary navigation"
    >
      <div style={{ padding: "20px 16px 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogoIcon size={32} />
          <div style={{ minWidth: 0 }}>
            <LogoWordmark fontSize={16} />
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-tertiary)",
                marginTop: 2,
                letterSpacing: "0.02em",
              }}
            >
              Community Edition
            </div>
          </div>
        </div>
      </div>

      <nav
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "0 8px 12px",
        }}
        aria-label="Application sections"
      >
        {groups.map((g) => (
          <NavGroup key={g.label} label={g.label} items={g.items} tour={g.tour} />
        ))}
      </nav>

      <div style={{ marginTop: "auto", flexShrink: 0 }}>
        <ZtaipStatusPanel />

        <div
          style={{
            padding: "4px 8px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <NavLink
            to="/help"
            data-tour="help"
            className={({ isActive }) => (isActive ? "cortex-sidebar-link-active" : undefined)}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 500,
              color: isActive ? "var(--text)" : "var(--text-secondary)",
              background: isActive ? "var(--blue-soft)" : "transparent",
              borderLeft: isActive ? "2px solid var(--blue)" : "2px solid transparent",
            })}
          >
            <span style={{ width: 22, textAlign: "center" }} aria-hidden>
              ?
            </span>
            Help
          </NavLink>
        </div>

        <div
          style={{
            padding: "14px 12px 16px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--elevated)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--cyan)",
              flexShrink: 0,
            }}
            aria-hidden
          >
            {userInitials(user)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userDisplayName(user)}
            </div>
            <div style={{ marginTop: 6 }}>
              <Badge variant="neutral" size="xs">
                {ROLE_LABELS[role]}
              </Badge>
            </div>
          </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="cortex-btn-ghost"
            style={{ marginTop: 10, width: "100%" }}
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
