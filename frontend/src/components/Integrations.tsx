import { useState, useEffect } from "react";
import {
  integrationsApi,
  type IntegrationSummary,
  type IntegrationDetail,
} from "../api/client";

const CARD_BG = "var(--card)";
const CARD_BORDER = "var(--border)";
const PANEL_BG = "var(--surface)";
const TEXT_PRIMARY = "var(--text)";
const TEXT_MUTED = "var(--text-secondary)";
const TEXT_GREY = "var(--text-quiet)";

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--green)",
          fontWeight: 600,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--green)",
          }}
        />
        Connected
      </span>
    );
  }
  if (status === "coming_soon") {
    return (
      <span style={{ fontSize: 11, color: TEXT_GREY, fontWeight: 500 }}>
        Coming Soon
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: TEXT_GREY,
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: TEXT_GREY,
        }}
      />
      Not Connected
    </span>
  );
}

const COMING_SOON_ITEMS = [
  { name: "Jira / Linear", category: "Development" },
  { name: "Okta / Auth0", category: "Identity & Access" },
  { name: "Qualys / Tenable", category: "Vulnerability" },
  { name: "Google Drive", category: "Collaboration" },
];

export function Integrations() {
  const [list, setList] = useState<IntegrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelIntegration, setPanelIntegration] = useState<IntegrationDetail | null>(null);
  const [panelTab, setPanelTab] = useState<"guide" | "credentials" | "preview">("guide");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    integrationsApi
      .list()
      .then((data) => {
        if (!cancelled) setList(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const openPanel = (integration: IntegrationSummary) => {
    setPanelIntegration(integration as IntegrationDetail);
    setPanelTab("guide");
    setCredentials({});
  };

  const closePanel = () => setPanelIntegration(null);

  const handleTestConnection = async () => {
    if (!panelIntegration) return;
    try {
      const res = await integrationsApi.test(panelIntegration.id);
      if (res.status === "coming_soon") {
        showToast("Coming in v0.4.0");
      } else {
        showToast(res.message || "Connection tested");
      }
    } catch {
      showToast("Coming in v0.4.0");
    }
  };

  const handleSaveCredentials = () => {
    showToast("Credentials saved (demo mode)");
  };

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const connectedCount = list.filter((i) => i.status === "connected").length;
  const availableCount = list.filter((i) => i.status !== "coming_soon").length;
  const comingSoonCount = 4;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: TEXT_PRIMARY,
            margin: 0,
            marginBottom: 6,
          }}
        >
          Integrations
        </h1>
        <p
          style={{
            fontSize: 14,
            color: TEXT_MUTED,
            margin: 0,
            marginBottom: 16,
            lineHeight: 1.45,
          }}
        >
          Connect data sources to enrich compliance intelligence automatically
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: "var(--green-soft)",
              color: "var(--green)",
              border: "1px solid color-mix(in srgb, var(--green) 30%, transparent)",
            }}
          >
            Connected: {connectedCount}
          </span>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: "var(--blue-soft)",
              color: "var(--blue)",
              border: "1px solid color-mix(in srgb, var(--blue) 30%, transparent)",
            }}
          >
            Available: {availableCount}
          </span>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: "color-mix(in srgb, var(--text-quiet) 20%, transparent)",
              color: TEXT_GREY,
              border: `1px solid ${CARD_BORDER}`,
            }}
          >
            Coming Soon: {comingSoonCount}
          </span>
        </div>
      </div>

      {/* Integration cards grid */}
      {loading ? (
        <div style={{ color: TEXT_MUTED, fontSize: 14 }}>Loading integrations…</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
          }}
        >
          {list.map((integration) => (
            <div
              key={integration.id}
              style={{
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 8,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                minHeight: 220,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: integration.color,
                      color: "var(--text)",
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {integration.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 15 }}>
                      {integration.name}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: TEXT_GREY,
                        background: "color-mix(in srgb, var(--text-quiet) 20%, transparent)",
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}
                    >
                      {integration.category}
                    </span>
                  </div>
                </div>
                <StatusBadge status={integration.status} />
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: TEXT_MUTED,
                  margin: 0,
                  marginBottom: 12,
                  lineHeight: 1.45,
                  flex: 1,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {integration.description}
              </p>
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: TEXT_GREY,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 6,
                  }}
                >
                  Satisfies
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(integration.compliance_value || [])
                    .slice(0, 3)
                    .map((ref, idx) => {
                      const short = ref.replace(/—.*/, "").trim();
                      return (
                        <span
                          key={idx}
                          style={{
                            fontSize: 10,
                            color: TEXT_GREY,
                            background: "color-mix(in srgb, var(--text-quiet) 20%, transparent)",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          {short}
                        </span>
                      );
                    })}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "auto",
                  paddingTop: 12,
                  borderTop: `1px solid ${CARD_BORDER}`,
                }}
              >
                {integration.status === "coming_soon" ? (
                  <span style={{ fontSize: 12, color: TEXT_GREY }}>
                    Coming soon
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openPanel(integration)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        border: "1px solid var(--blue)",
                        background: "transparent",
                        color: "var(--blue)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Configure
                    </button>
                    {integration.status === "connected" ? (
                      <span style={{ fontSize: 11, color: TEXT_GREY }}>
                        Last synced: — mins ago
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: TEXT_GREY }}>
                        Setup guide available
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Coming soon section */}
      <div style={{ marginTop: 32 }}>
        <button
          type="button"
          onClick={() => setComingSoonOpen((o) => !o)}
          style={{
            background: "transparent",
            border: "none",
            color: TEXT_GREY,
            fontSize: 13,
            cursor: "pointer",
            padding: "4px 0",
            marginBottom: comingSoonOpen ? 16 : 0,
          }}
        >
          {comingSoonOpen ? "▼" : "▶"} More integrations coming soon
        </button>
        {comingSoonOpen && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
            }}
          >
            {COMING_SOON_ITEMS.map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: CARD_BG,
                  border: `1px solid ${CARD_BORDER}`,
                  borderRadius: 8,
                  padding: 16,
                  opacity: 0.7,
                }}
              >
                <div style={{ fontWeight: 600, color: TEXT_MUTED, fontSize: 14 }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 11, color: TEXT_GREY, marginTop: 4 }}>
                  {item.category}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Setup panel */}
      {panelIntegration && (
        <SetupPanel
          integration={panelIntegration}
          onClose={closePanel}
          activeTab={panelTab}
          onTabChange={setPanelTab}
          credentials={credentials}
          onCredentialsChange={setCredentials}
          onTestConnection={handleTestConnection}
          onSaveCredentials={handleSaveCredentials}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "10px 18px",
            background: "var(--elevated)",
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 8,
            color: TEXT_PRIMARY,
            fontSize: 13,
            boxShadow: "var(--shadow-drop-md)",
            zIndex: 1000,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

type TabKey = "guide" | "credentials" | "preview";

function SetupPanel({
  integration,
  onClose,
  activeTab,
  onTabChange,
  credentials,
  onCredentialsChange,
  onTestConnection,
  onSaveCredentials,
}: {
  integration: IntegrationDetail;
  onClose: () => void;
  activeTab: TabKey;
  onTabChange: (t: TabKey) => void;
  credentials: Record<string, string>;
  onCredentialsChange: (c: Record<string, string>) => void;
  onTestConnection: () => void;
  onSaveCredentials: () => void;
}) {
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const toggleSecret = (key: string) => {
    setShowSecrets((s) => ({ ...s, [key]: !s[key] }));
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "guide", label: "Setup Guide" },
    { key: "credentials", label: "Credentials" },
    { key: "preview", label: "Data Preview" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 480,
        height: "100vh",
        background: PANEL_BG,
        borderLeft: `1px solid ${CARD_BORDER}`,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        boxShadow: "var(--shadow-panel-left)",
      }}
    >
      {/* Panel header */}
      <div
        style={{
          padding: "20px 20px 16px",
          borderBottom: `1px solid ${CARD_BORDER}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: integration.color,
              color: "var(--text)",
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {integration.icon}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 16 }}>
              {integration.name}
            </div>
            <StatusBadge status={integration.status} />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            border: `1px solid ${CARD_BORDER}`,
            background: "transparent",
            color: TEXT_MUTED,
            fontSize: 18,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${CARD_BORDER}`,
          padding: "0 20px",
        }}
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            style={{
              padding: "12px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: activeTab === key ? "var(--blue)" : TEXT_GREY,
              background: "none",
              border: "none",
              borderBottom:
                activeTab === key ? "2px solid var(--blue)" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {activeTab === "guide" && (
          <div>
            <div
              style={{
                background: "var(--amber-soft)",
                border: "1px solid color-mix(in srgb, var(--amber) 40%, transparent)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                fontSize: 12,
                color: "var(--text)",
                lineHeight: 1.5,
              }}
            >
              ⚠ Credentials are stored encrypted. Never share your secrets.
              CORTEX uses read-only access only.
            </div>
            {(integration.setup_steps || []).map((step) => (
              <div
                key={step.step}
                style={{
                  marginBottom: 20,
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--blue)",
                    color: "var(--text)",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {step.step}
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      color: TEXT_PRIMARY,
                      fontSize: 13,
                      marginBottom: 4,
                    }}
                  >
                    {step.title}
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: TEXT_MUTED,
                      lineHeight: 1.5,
                    }}
                  >
                    {step.description}
                  </p>
                  {step.docs_url?.trim() ? (
                    <a
                      href={step.docs_url.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 12,
                        color: "var(--blue)",
                        marginTop: 4,
                        display: "inline-block",
                      }}
                    >
                      View docs →
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "credentials" && (
          <div>
            <div
              style={{
                background: "var(--amber-soft)",
                border: "1px solid color-mix(in srgb, var(--amber) 40%, transparent)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                fontSize: 12,
                color: "var(--text)",
                lineHeight: 1.5,
              }}
            >
              ⚠ Credentials are stored encrypted. Never share your secrets.
              CORTEX uses read-only access only.
            </div>
            {(integration.credentials_required || []).map((field) => (
              <div key={field.key} style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: TEXT_MUTED,
                    marginBottom: 6,
                  }}
                >
                  {field.label}
                </label>
                {field.multiline ? (
                  <textarea
                    value={credentials[field.key] ?? ""}
                    onChange={(e) =>
                      onCredentialsChange({
                        ...credentials,
                        [field.key]: e.target.value,
                      })
                    }
                    placeholder={field.placeholder}
                    rows={4}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 6,
                      border: `1px solid ${CARD_BORDER}`,
                      background: CARD_BG,
                      color: TEXT_PRIMARY,
                      fontSize: 13,
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <div style={{ position: "relative" }}>
                    <input
                      type={
                        field.secret && !showSecrets[field.key]
                          ? "password"
                          : "text"
                      }
                      value={credentials[field.key] ?? ""}
                      onChange={(e) =>
                        onCredentialsChange({
                          ...credentials,
                          [field.key]: e.target.value,
                        })
                      }
                      placeholder={field.placeholder}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        paddingRight: field.secret ? 40 : 12,
                        borderRadius: 6,
                        border: `1px solid ${CARD_BORDER}`,
                        background: CARD_BG,
                        color: TEXT_PRIMARY,
                        fontSize: 13,
                        boxSizing: "border-box",
                      }}
                    />
                    {field.secret && (
                      <button
                        type="button"
                        onClick={() => toggleSecret(field.key)}
                        style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: TEXT_GREY,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        {showSecrets[field.key] ? "Hide" : "Show"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={onTestConnection}
                style={{
                  padding: "10px 18px",
                  borderRadius: 6,
                  border: "1px solid var(--blue)",
                  background: "transparent",
                  color: "var(--blue)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Test Connection
              </button>
              <button
                type="button"
                onClick={onSaveCredentials}
                style={{
                  padding: "10px 18px",
                  borderRadius: 6,
                  border: "none",
                  background: "var(--green)",
                  color: "var(--text)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Save Credentials
              </button>
            </div>
          </div>
        )}

        {activeTab === "preview" && (
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: TEXT_MUTED,
                marginBottom: 12,
              }}
            >
              Data collected
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, marginBottom: 24 }}>
              {(integration.data_collected || []).map((item, idx) => (
                <li
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    fontSize: 13,
                    color: TEXT_PRIMARY,
                  }}
                >
                  <span style={{ color: "var(--green)", fontSize: 14 }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: TEXT_MUTED,
                marginBottom: 8,
              }}
            >
              Compliance controls this satisfies
            </div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(integration.compliance_value || []).map((ref, idx) => (
                <li
                  key={idx}
                  style={{
                    marginBottom: 4,
                    fontSize: 12,
                    color: TEXT_GREY,
                    lineHeight: 1.4,
                  }}
                >
                  {ref}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
