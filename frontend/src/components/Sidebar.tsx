import { NavLink, useLocation } from "react-router-dom";
import { LogoIcon } from "./Logo";
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
};

type NavGroupDef = { label: string; items: NavItem[] };

// Top-level categories. Learning is the primary surface; remaining groups
// stay for pages that are still directly routable.
const NAV_GROUPS: NavGroupDef[] = [
  {
    label: "Explore",
    items: [
      { label: "Audit Simulator", path: "/intelligence/simulator", icon: "▷" },
    ],
  },
  {
    label: "Train",
    items: [
      { label: "Learning Loop", path: "/learning", icon: "↻" },
    ],
  },
  {
    label: "Discover",
    items: [
      { label: "Review Queue", path: "/review-queue", icon: "⇌", badge: "review" },
      { label: "Control Gaps", path: "/findings", icon: "⚑", badge: "findings" },
      { label: "Remediation Tracker", path: "/remediation", icon: "↻" },
    ],
  },
  {
    label: "Evidence",
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

function DeployEnvBadge() {
  const custom = import.meta.env.VITE_CORTEX_DEPLOY_LABEL?.trim();
  const label = custom || (import.meta.env.DEV ? "DEV" : "");
  if (!label) return null;
  const isDev = !custom && import.meta.env.DEV;
  return (
    <span
      title={isDev ? "Development build" : "Deployment label from VITE_CORTEX_DEPLOY_LABEL"}
      style={{
        padding: "2px 8px",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--text-micro)",
        fontWeight: 700,
        letterSpacing: "0.06em",
        background: isDev ? "var(--amber-soft)" : "var(--blue-soft)",
        border: `1px solid ${isDev ? "color-mix(in srgb, var(--amber) 45%, transparent)" : "color-mix(in srgb, var(--blue) 35%, transparent)"}`,
        color: isDev ? "var(--amber)" : "var(--text)",
      }}
    >
      {label.toUpperCase()}
    </span>
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

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const { orgId } = useOrgContext();
  const { pathname } = useLocation();
  const { data: posture } = useCompliancePosture(orgId);
  const { items: rqItems } = useReviewQueue(orgId);

  const findingsCount = posture?.criticalGapsCount ?? 0;
  const reviewCount = rqItems?.length ?? 0;

  return (
    <div style={{ marginBottom: 18 }}>
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
                background: active ? "var(--card)" : "transparent",
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

  // Hide Settings from the Operations group when the role lacks access.
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => it.path !== "/settings" || canSettings),
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
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 800,
                fontSize: 15,
                letterSpacing: "0.14em",
                color: "var(--text)",
                lineHeight: 1.15,
              }}
            >
              CORTEX
            </div>
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
          <NavGroup key={g.label} label={g.label} items={g.items} />
        ))}
      </nav>

      <div style={{ marginTop: "auto", flexShrink: 0 }}>
        <ZtaipStatusPanel />

        <div style={{ padding: "10px 12px", display: "flex", justifyContent: "center" }}>
          <DeployEnvBadge />
        </div>

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
              background: isActive ? "var(--card)" : "transparent",
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
