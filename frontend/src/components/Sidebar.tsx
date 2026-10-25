import { NavLink, useLocation } from "react-router-dom";
import { LogoIcon, LogoWordmark } from "./Logo";
import { isPrimaryNavActive } from "../lib/navActive";
import { Badge } from "./ui/Badge";
import { useRole } from "../hooks/useRole";
import { ROLE_LABELS } from "../lib/roles";

const SIDEBAR_W = 220;

export const SIDEBAR_WIDTH_PX = SIDEBAR_W;

type NavItem = {
  label: string;
  path: string;
  icon: string;
};

type NavGroupDef = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroupDef[] = [
  {
    label: "Astra",
    items: [
      { label: "Practices", path: "/practices", icon: "◆" },
      { label: "Learning", path: "/learning", icon: "↻" },
      { label: "Progress", path: "/progress", icon: "▲" },
      { label: "Team", path: "/team", icon: "☰" },
      { label: "Instructor", path: "/instructor", icon: "◎" },
      { label: "Settings", path: "/settings", icon: "⚙" },
      { label: "Scenario studio", path: "/scenarios/new", icon: "✎" },
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

function NavGroup({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  onNavigate: () => void;
}) {
  const { pathname } = useLocation();

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
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end
              aria-current={active ? "page" : undefined}
              className="cortex-sidebar-link"
              onClick={onNavigate}
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
  open = false,
  onNavigate = () => undefined,
}: {
  user: Record<string, unknown> | null;
  onLogout: () => void;
  open?: boolean;
  onNavigate?: () => void;
}) {
  const { role, can } = useRole();
  const canSettings = can("canAccessSettings");
  const canTeam = can("canViewTeamCompetency");
  const canInstructor = can("canCoachLearners");
  const canAuthor = can("canManageCurriculum");

  // Hide Settings and the org ledger when the role lacks access.
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => {
      if (it.path === "/settings") return canSettings;
      if (it.path === "/team") return canTeam;
      if (it.path === "/instructor") return canInstructor;
      if (it.path === "/scenarios/new") return canAuthor;
      return true;
    }),
  }));

  return (
    <aside
      id="primary-sidebar"
      className="cortex-sidebar"
      data-open={open}
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
          <NavGroup key={g.label} label={g.label} items={g.items} onNavigate={onNavigate} />
        ))}
      </nav>

      <div style={{ marginTop: "auto", flexShrink: 0 }}>
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
            onClick={onNavigate}
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
