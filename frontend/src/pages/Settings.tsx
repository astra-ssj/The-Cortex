import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { inviteOrgUser, listOrgUsers } from "../api/orgUsers";
import { useRole } from "../hooks/useRole";

type TabId = "org" | "users" | "api";

const TABS: { id: TabId; label: string }[] = [
  { id: "org", label: "Organisation" },
  { id: "users", label: "Users" },
  { id: "api", label: "API Keys" },
];

export default function Settings() {
  const [tab, setTab] = useState<TabId>("org");
  const { can } = useRole();

  return (
    <div style={{ paddingTop: 8 }}>
      <div className="flex flex-wrap gap-2 pb-6">
        {TABS.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant={tab === t.id ? "primary" : "ghost"}
            size="sm"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "org" ? (
        <EmptyState
          icon="🏢"
          title="Coming soon"
          description="Organisation settings will be available in a future release."
        />
      ) : null}
      {tab === "users" ? (
        can("canAccessSettings") ? (
          <UsersTab />
        ) : (
          <EmptyState icon="👥" title="Restricted" description="Only admins can manage organisation members." />
        )
      ) : null}
      {tab === "api" ? (
        <EmptyState icon="🔑" title="Coming soon" description="API key management is not available yet." />
      ) : null}
    </div>
  );
}

function UsersTab() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("ANALYST");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [error, setError] = useState("");

  const usersQuery = useQuery({
    queryKey: ["org-users"],
    queryFn: listOrgUsers,
  });

  const invite = useMutation({
    mutationFn: () =>
      inviteOrgUser({
        email: email.trim(),
        full_name: fullName.trim(),
        role,
      }),
    onSuccess: (data) => {
      setIssuedToken(data.token);
      setError("");
      setEmail("");
      setFullName("");
      void queryClient.invalidateQueries({ queryKey: ["org-users"] });
    },
    onError: (err: Error) => {
      setIssuedToken(null);
      setError(err.message || "Invite failed.");
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Team members</h2>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          Registration creates a new organisation. An invite is the only way a
          second learner joins this one.
        </p>
      </div>

      {usersQuery.isPending ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading members…</p>
      ) : usersQuery.isError ? (
        <p style={{ color: "var(--red)", fontSize: 13 }}>Could not load members.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {(usersQuery.data?.users ?? []).map((user) => (
            <li
              key={user.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--panel)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{user.full_name || user.email}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{user.email}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                {user.role}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) invite.mutate();
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 16,
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--panel)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>Invite a learner</div>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="learner@company.com"
          aria-label="Invite email"
          style={fieldStyle}
        />
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name (optional)"
          aria-label="Invite full name"
          style={fieldStyle}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Invite role"
          style={fieldStyle}
        >
          <option value="ANALYST">Analyst</option>
          <option value="VIEWER">Viewer</option>
        </select>
        <Button type="submit" disabled={invite.isPending || !email.trim()}>
          {invite.isPending ? "Issuing…" : "Issue invite"}
        </Button>
        {error ? <p style={{ margin: 0, color: "var(--red)", fontSize: 12 }}>{error}</p> : null}
        {issuedToken ? (
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-secondary)" }}>
              Share this token once. It will not be shown again.
            </p>
            <code
              data-testid="invite-token"
              style={{
                display: "block",
                padding: 10,
                borderRadius: 6,
                background: "var(--card)",
                fontSize: 12,
                wordBreak: "break-all",
              }}
            >
              {issuedToken}
            </code>
          </div>
        ) : null}
      </form>
    </div>
  );
}

const fieldStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: 13,
  boxSizing: "border-box" as const,
};
