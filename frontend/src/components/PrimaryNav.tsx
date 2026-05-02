import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { EngineBadge } from "./ui/TrustChip";

export type NavGroupItem = { label: string; path: string; engine?: "shasta" };

export type NavGroup = {
  id: string;
  label: string;
  items: NavGroupItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { label: "Dashboard", path: "/dashboard" },
      { label: "Group", path: "/group" },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    items: [
      { label: "Frameworks", path: "/frameworks" },
      { label: "Remediation", path: "/evidence" },
      { label: "Audit Report", path: "/audit-report" },
    ],
  },
  {
    id: "intel",
    label: "Intelligence",
    items: [
      { label: "Intelligence", path: "/intelligence" },
      { label: "AI Systems", path: "/ai-systems" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { label: "Review Queue", path: "/review-queue" },
      { label: "Integrations", path: "/integrations" },
      { label: "Cloud scans", path: "/cloud-scans", engine: "shasta" },
      { label: "Roadmap", path: "/roadmap" },
    ],
  },
];

/** Framework detail routes stay under Compliance → Frameworks. */
export function isPrimaryNavActive(navPath: string, pathname: string): boolean {
  if (navPath === "/frameworks") {
    return pathname === "/frameworks" || pathname.startsWith("/frameworks/");
  }
  return pathname === navPath;
}

function groupContainsActivePath(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => isPrimaryNavActive(item.path, pathname));
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`cortex-nav-dropdown-chevron ${open ? "cortex-nav-dropdown-chevron--open" : ""}`}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Compact primary navigation: one control per domain with an anchored panel of routes.
 * Avoids a single long horizontal strip of links on wide screens.
 */
export function PrimaryNav() {
  const { pathname } = useLocation();
  const [openId, setOpenId] = useState<string | null>(null);
  const clusterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpenId(null);
  }, [pathname]);

  useEffect(() => {
    if (!openId) return;
    const onDocDown = (e: MouseEvent) => {
      if (clusterRef.current && !clusterRef.current.contains(e.target as Node)) {
        setOpenId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  return (
    <div ref={clusterRef} className="cortex-nav-dropdown-cluster">
      {NAV_GROUPS.map((group) => {
        const groupActive = groupContainsActivePath(group, pathname);
        const isOpen = openId === group.id;
        const menuId = `cortex-nav-menu-${group.id}`;
        const triggerId = `cortex-nav-trigger-${group.id}`;

        return (
          <div key={group.id} className="cortex-nav-dropdown">
            <button
              type="button"
              id={triggerId}
              className="cortex-nav-dropdown-trigger"
              aria-expanded={isOpen}
              aria-haspopup="true"
              aria-controls={menuId}
              data-group-active={groupActive ? "true" : "false"}
              data-open={isOpen ? "true" : "false"}
              onClick={() => setOpenId((cur) => (cur === group.id ? null : group.id))}
            >
              <span className="cortex-nav-dropdown-trigger-label">{group.label}</span>
              <Chevron open={isOpen} />
            </button>

            {isOpen ? (
              <div
                id={menuId}
                role="region"
                aria-labelledby={triggerId}
                className="cortex-nav-dropdown-panel"
              >
                <ul className="cortex-nav-dropdown-list">
                  {group.items.map((item) => {
                    const active = isPrimaryNavActive(item.path, pathname);
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          className="cortex-nav-dropdown-link"
                          data-active={active ? "true" : "false"}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpenId(null)}
                        >
                          <span>{item.label}</span>
                          {item.engine === "shasta" ? <EngineBadge name="Shasta" compact /> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
