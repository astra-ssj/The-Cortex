import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { getUser } from "../api/client";
import {
  changePassword,
  getOrganisation,
  inviteOrgUser,
  listOrgUsers,
  updateOrganisation,
} from "../api/orgUsers";
import { useOrgContext } from "../hooks/useOrgContext";
import { useRole } from "../hooks/useRole";

type TabId = "org" | "users" | "account";

const TABS: { id: TabId; label: string }[] = [
  { id: "org", label: "Organisation" },
  { id: "users", label: "Users" },
  { id: "account", label: "Account" },
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
            aria-pressed={tab === t.id}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "org" ? <OrganisationTab /> : null}
      {tab === "users" ? (
        can("canAccessSettings") ? (
          <UsersTab />
        ) : (
          <EmptyState icon="👥" title="Restricted" description="Only admins can manage organisation members." />
        )
      ) : null}
      {tab === "account" ? <AccountTab /> : null}
    </div>
  );
}

function OrganisationTab() {
  const { orgId } = useOrgContext();
  const { can } = useRole();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [industry, setIndustry] = useState("");
  const [region, setRegion] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editable = can("canAccessSettings");
  const organisation = useQuery({
    queryKey: ["organisation", orgId],
    queryFn: () => getOrganisation(orgId),
  });

  const loaded = organisation.data;
  useEffect(() => {
    if (!loaded) return;
    setName(loaded.name);
    setJurisdiction(loaded.jurisdiction);
    setIndustry(loaded.industry ?? "");
    setRegion(loaded.region ?? "");
  }, [loaded]);
  const save = useMutation({
    mutationFn: () =>
      updateOrganisation(orgId, {
        name,
        jurisdiction,
        industry,
        region,
      }),
    onSuccess: (profile) => {
      setMessage("Organisation profile saved.");
      setError("");
      queryClient.setQueryData(["organisation", orgId], profile);
    },
    onError: (err: Error) => {
      setMessage("");
      setError(err.message || "Organisation profile could not be saved.");
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      {organisation.isPending ? <p role="status">Loading organisation…</p> : null}
      {organisation.isError ? (
        <p role="alert" style={{ color: "var(--red)" }}>The organisation profile could not be loaded.</p>
      ) : null}
      {loaded ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (editable) save.mutate();
          }}
          style={{ display: "grid", gap: 10 }}
        >
          <label htmlFor="org-name">Organisation name</label>
          <input id="org-name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} disabled={!editable} style={fieldStyle} />
          <label htmlFor="org-jurisdiction">Jurisdiction</label>
          <input id="org-jurisdiction" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} required minLength={2} disabled={!editable} style={fieldStyle} />
          <label htmlFor="org-industry">Industry</label>
          <input id="org-industry" value={industry} onChange={(event) => setIndustry(event.target.value)} disabled={!editable} style={fieldStyle} />
          <label htmlFor="org-region">Region</label>
          <input id="org-region" value={region} onChange={(event) => setRegion(event.target.value)} disabled={!editable} style={fieldStyle} />
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
            Target frameworks: {(loaded.selectedFrameworks ?? []).join(", ") || "Set during the learner diagnostic."}
          </p>
          {editable ? (
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save organisation"}</Button>
          ) : null}
          {message ? <p role="status">{message}</p> : null}
          {error ? <p role="alert" style={{ color: "var(--red)" }}>{error}</p> : null}
        </form>
      ) : null}
      <a href="/onboarding">Review learner diagnostic</a>
    </div>
  );
}

function AccountTab() {
  const user = getUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: (result) => {
      setMessage(result.message);
      setError("");
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (err: Error) => {
      setMessage("");
      setError(err.message || "Password could not be changed.");
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      style={{ display: "grid", gap: 10, maxWidth: 640 }}
    >
      <h2 style={{ margin: 0, fontSize: 16 }}>Your account</h2>
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>{String(user?.email ?? "Signed-in learner")}</p>
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>Role: {String(user?.role ?? "learner")}</p>
      <label htmlFor="current-password">Current password</label>
      <input id="current-password" type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} style={fieldStyle} />
      <label htmlFor="new-password">New password</label>
      <input id="new-password" type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} style={fieldStyle} />
      <Button type="submit" disabled={save.isPending}>{save.isPending ? "Updating…" : "Update password"}</Button>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert" style={{ color: "var(--red)" }}>{error}</p> : null}
    </form>
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
      window.requestAnimationFrame(() => document.getElementById("invite-result")?.focus());
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
        <p role="status" aria-live="polite" style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading members…</p>
      ) : usersQuery.isError ? (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13 }}>Could not load members.</p>
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
        <label htmlFor="invite-email">Invite email</label>
        <input
          id="invite-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="learner@company.com"
          style={fieldStyle}
        />
        <label htmlFor="invite-name">Full name (optional)</label>
        <input
          id="invite-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name (optional)"
          style={fieldStyle}
        />
        <label htmlFor="invite-role">Role</label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={fieldStyle}
        >
          <option value="ANALYST">Analyst</option>
          <option value="VIEWER">Viewer</option>
        </select>
        <Button type="submit" disabled={invite.isPending || !email.trim()}>
          {invite.isPending ? "Issuing…" : "Issue invite"}
        </Button>
        {error ? <p role="alert" style={{ margin: 0, color: "var(--red)", fontSize: 12 }}>{error}</p> : null}
        {issuedToken ? (
          <div id="invite-result" role="status" aria-live="polite" tabIndex={-1}>
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
