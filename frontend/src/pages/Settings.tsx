import { useState } from "react";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";

type TabId = "org" | "users" | "api";

const TABS: { id: TabId; label: string }[] = [
  { id: "org", label: "Organisation" },
  { id: "users", label: "Users" },
  { id: "api", label: "API Keys" },
];

export default function Settings() {
  const [tab, setTab] = useState<TabId>("org");

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
        <EmptyState icon="👥" title="Coming soon" description="User management is not available yet." />
      ) : null}
      {tab === "api" ? (
        <EmptyState icon="🔑" title="Coming soon" description="API key management is not available yet." />
      ) : null}
    </div>
  );
}
