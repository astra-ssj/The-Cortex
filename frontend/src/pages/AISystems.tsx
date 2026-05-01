import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AISystemCardSkeleton } from "../components/Skeleton";

type RiskLabel = "HIGH" | "LIMITED" | "MINIMAL" | "UNCLASSIFIED";
type SystemStatus = "NOT_ASSESSED" | "IN_PROGRESS" | "ASSESSED" | "UNCLASSIFIED";

type AISystem = {
  id: string;
  name: string;
  icon: string;
  risk: RiskLabel;
  annex: string;
  provider: string;
  entity: string;
  use_case: string;
  data: string;
  status: SystemStatus;
  conformity: string;
};

const AI_ACT_DEADLINE_ISO = "2026-08-02";

function calendarDaysUntilDeadline(): number {
  const parts = AI_ACT_DEADLINE_ISO.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const deadline = Date.UTC(y, m - 1, d);
  const now = new Date();
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((deadline - start) / 86400000);
}

function countdownColor(days: number): string {
  if (days > 120) return "#4ade80";
  if (days >= 60) return "#fbbf24";
  return "#f87171";
}

const SYSTEMS: AISystem[] = [
  {
    id: "hr-screening",
    name: "HR Candidate Screening",
    icon: "👥",
    risk: "HIGH",
    annex: "Annex III(4)(a)",
    provider: "OpenAI GPT-4o",
    entity: "AstraLabs Group",
    use_case: "CV ranking and candidate shortlisting",
    data: "Personal data + special category",
    status: "NOT_ASSESSED",
    conformity: "Third-party required",
  },
  {
    id: "cortex-engine",
    name: "CORTEX Assessment Engine",
    icon: "🔍",
    risk: "HIGH",
    annex: "Annex III(6)(a)",
    provider: "Anthropic Claude (internal)",
    entity: "AstraLabs Group",
    use_case: "Automated compliance assessment affecting organisational decisions",
    data: "Compliance + operational data",
    status: "IN_PROGRESS",
    conformity: "Internal assessment (Art.43(2))",
  },
  {
    id: "churn",
    name: "Customer Churn Predictor",
    icon: "📊",
    risk: "LIMITED",
    annex: "Art.50 (transparency only)",
    provider: "Internal ML (scikit-learn)",
    entity: "AstraLabs US",
    use_case: "Predict customer churn probability",
    data: "Usage + billing data",
    status: "ASSESSED",
    conformity: "Transparency notice required",
  },
  {
    id: "doc-intel",
    name: "Document Intelligence",
    icon: "📄",
    risk: "UNCLASSIFIED",
    annex: "Pending classification",
    provider: "Azure OpenAI",
    entity: "AstraLabs DE",
    use_case: "Contract analysis and summarisation",
    data: "Confidential documents",
    status: "UNCLASSIFIED",
    conformity: "Classification required",
  },
  {
    id: "anomaly",
    name: "Security Anomaly Detector",
    icon: "🛡️",
    risk: "HIGH",
    annex: "Annex III(6)(b)",
    provider: "Internal (TensorFlow)",
    entity: "AstraLabs DE",
    use_case: "Network anomaly detection for critical infrastructure",
    data: "Network telemetry",
    status: "NOT_ASSESSED",
    conformity: "Third-party may be required",
  },
  {
    id: "report-gen",
    name: "Compliance Report Generator",
    icon: "📋",
    risk: "MINIMAL",
    annex: "Not listed (Art.6(3))",
    provider: "Anthropic Claude (CORTEX)",
    entity: "AstraLabs Group",
    use_case: "Board report generation (human reviews all output)",
    data: "Compliance data",
    status: "ASSESSED",
    conformity: "None required",
  },
];

type ClassificationEntry = {
  systemId: string;
  riskDisplay: string;
  annex: string;
  confidence: number;
  reasoning: string;
  isoMapping: string;
  articles: string;
};

const CLASSIFICATIONS: Record<string, ClassificationEntry> = {
  "hr-screening": {
    systemId: "hr-screening",
    riskDisplay: "HIGH RISK",
    annex: "(4)(a)",
    confidence: 0.94,
    reasoning:
      "This system is used for recruitment and employment decisions affecting natural persons. Annex III(4)(a) explicitly lists 'AI systems used for recruitment or selection of natural persons' as high-risk. The final decision involves human review, but AI-assisted ranking constitutes a materially significant influence under Art.6(2).",
    isoMapping:
      "ISO 42001 Annex A.6.2 requires documented human oversight for high-impact AI decisions. ISO 42001 A.4.2 risk assessment must cover discriminatory outcome risks.",
    articles: "Art.6(2) · Annex III(4)(a) · Art.14 · Art.43(1) · Art.9 · ISO 42001 A.6.2",
  },
  "cortex-engine": {
    systemId: "cortex-engine",
    riskDisplay: "HIGH RISK",
    annex: "(6)(a)",
    confidence: 0.91,
    reasoning:
      "Annex III(6)(a) covers AI intended to evaluate eligibility for essential private and public services. Automated compliance scoring that gates workflows or prioritises remediation materially affects access to assurance outcomes—within the essential-service evaluation paradigm when coupled with enforcement exposure.",
    isoMapping:
      "ISO 42001 A.5.2 lifecycle documentation and A.6.2 human oversight apply where AI influences consequential compliance conclusions; A.8.2 demands impact assessment for fundamental rights.",
    articles: "Art.6(2) · Annex III(6)(a) · Art.14 · Art.15 · Art.43(2) · ISO 42001 A.5.2 · A.6.2",
  },
  churn: {
    systemId: "churn",
    riskDisplay: "LIMITED RISK",
    annex: "Art.50",
    confidence: 0.82,
    reasoning:
      "Customer churn prediction affects contractual economics but not Annex III high-risk categories directly. Transparency obligations under Art.52 and Art.50 apply where humans interact with AI-generated predictions in commercial contexts.",
    isoMapping:
      "ISO 42001 A.7.2 covers communication of AI use to affected parties; A.4.2 still requires proportionate risk treatment for automated decisions with legal/financial effects.",
    articles: "Art.50 · Art.52(3) · Art.6(3) · ISO 42001 A.7.2 · A.4.2",
  },
  "doc-intel": {
    systemId: "doc-intel",
    riskDisplay: "UNCLASSIFIED",
    annex: "Pending",
    confidence: 0.55,
    reasoning:
      "Contract summarisation may remain minimal risk if outputs are advisory only and humans negotiate terms. If outputs feed automated approval workflows for regulated clauses, Annex III(5) or (6) classification must be revisited under Art.6(2).",
    isoMapping:
      "ISO 42001 A.4.2 mandates reassessment when context of use changes; A.5.3 requires clarity on decision autonomy versus assistive mode.",
    articles: "Art.6 · Annex III · Art.53 · ISO 42001 A.4.2 · A.5.3",
  },
  anomaly: {
    systemId: "anomaly",
    riskDisplay: "HIGH RISK",
    annex: "(6)(b)",
    confidence: 0.88,
    reasoning:
      "Annex III(6)(b) lists AI for critical digital infrastructure operation. Network anomaly detection tied to SOC response for essential entities aligns with safety-critical infrastructure monitoring, triggering high-risk obligations where actions affect service continuity at scale.",
    isoMapping:
      "ISO 42001 A.6.2 and A.8.1 address oversight and robustness for safety-related AI; linkage to ISO/IEC 42001 risk treatment supports EU AI Act Art.9 documentation.",
    articles: "Art.6(2) · Annex III(6)(b) · Art.14 · Art.15 · Art.43 · ISO 42001 A.6.2 · A.8.1",
  },
  "report-gen": {
    systemId: "report-gen",
    riskDisplay: "MINIMAL RISK",
    annex: "Art.6(3)",
    confidence: 0.79,
    reasoning:
      "Where every board-facing output is reviewed and edited by humans before reliance, the system functions as a drafting assistant outside Annex III listings (Art.6(3)). Risk rises if drafts are adopted without meaningful review.",
    isoMapping:
      "ISO 42001 A.6.2 still recommends documenting human sign-off for high-stakes communications; A.5.2 maintains provenance of AI-assisted content.",
    articles: "Art.6(3) · Art.52 · ISO 42001 A.6.2 · A.5.2",
  },
};

type ObligationStatus = "NOT_IMPLEMENTED" | "IN_PROGRESS" | "IMPLEMENTED";

type ObligationRow = {
  article: string;
  label: string;
  status: ObligationStatus;
  effort: string;
};

const HR_OBLIGATIONS: ObligationRow[] = [
  { article: "Article 9", label: "Risk management system", status: "NOT_IMPLEMENTED", effort: "HIGH" },
  { article: "Article 10", label: "Data governance", status: "IN_PROGRESS", effort: "MEDIUM" },
  { article: "Article 11", label: "Technical documentation (Annex IV)", status: "NOT_IMPLEMENTED", effort: "HIGH" },
  { article: "Article 12", label: "Automatic logging", status: "NOT_IMPLEMENTED", effort: "HIGH" },
  { article: "Article 13", label: "Transparency", status: "IN_PROGRESS", effort: "LOW" },
  { article: "Article 14", label: "Human oversight", status: "NOT_IMPLEMENTED", effort: "MEDIUM" },
  { article: "Article 43", label: "Conformity assessment", status: "NOT_IMPLEMENTED", effort: "CRITICAL" },
];

const CORTEX_OBLIGATIONS: ObligationRow[] = [
  { article: "Article 9", label: "Risk management system", status: "IN_PROGRESS", effort: "HIGH" },
  { article: "Article 10", label: "Data governance", status: "IN_PROGRESS", effort: "MEDIUM" },
  { article: "Article 11", label: "Technical documentation (Annex IV)", status: "IN_PROGRESS", effort: "HIGH" },
  { article: "Article 12", label: "Automatic logging", status: "NOT_IMPLEMENTED", effort: "HIGH" },
  { article: "Article 13", label: "Transparency", status: "IN_PROGRESS", effort: "LOW" },
  { article: "Article 14", label: "Human oversight", status: "IN_PROGRESS", effort: "MEDIUM" },
  { article: "Article 43", label: "Conformity assessment", status: "NOT_IMPLEMENTED", effort: "CRITICAL" },
];

const ANOMALY_OBLIGATIONS: ObligationRow[] = HR_OBLIGATIONS.map((row) => ({
  ...row,
  status: "NOT_IMPLEMENTED" as const,
}));

const OBLIGATION_PRESETS: Record<string, ObligationRow[]> = {
  "hr-screening": HR_OBLIGATIONS,
  "cortex-engine": CORTEX_OBLIGATIONS,
  anomaly: ANOMALY_OBLIGATIONS,
};

const READINESS: Record<string, number> = {
  "hr-screening": 14,
  "cortex-engine": 43,
  anomaly: 8,
};

function cardBorder(risk: RiskLabel): CSSProperties {
  if (risk === "HIGH") return { borderLeft: "4px solid #ef4444" };
  if (risk === "LIMITED") return { borderLeft: "4px solid #f59e0b" };
  if (risk === "MINIMAL") return { borderLeft: "4px solid #22c55e" };
  return { borderLeft: "4px dashed #64748b" };
}

function statusLabel(s: SystemStatus): string {
  switch (s) {
    case "NOT_ASSESSED":
      return "⚠ NOT ASSESSED";
    case "IN_PROGRESS":
      return "◐ IN PROGRESS";
    case "ASSESSED":
      return "✓ ASSESSED";
    default:
      return "○ UNCLASSIFIED";
  }
}

function obligationRowStyle(
  row: ObligationRow,
  daysLeft: number,
): { color: string; statusText: string } {
  const urgent = daysLeft < 90;
  if (row.status === "IMPLEMENTED") return { color: "#4ade80", statusText: "✓ IMPLEMENTED" };
  if (row.status === "IN_PROGRESS")
    return { color: urgent ? "#fbbf24" : "#94a3b8", statusText: "⚠ IN PROGRESS" };
  if (row.article === "Article 43")
    return { color: urgent ? "#f87171" : "#94a3b8", statusText: "✗ NOT STARTED" };
  return { color: urgent ? "#f87171" : "#94a3b8", statusText: "✗ NOT IMPLEMENTED" };
}

type TabKey = "inventory" | "classification" | "obligations";

export default function AISystems() {
  const [tab, setTab] = useState<TabKey>("inventory");
  const [selectedSystemId, setSelectedSystemId] = useState<string>(SYSTEMS[0]!.id);
  const [inventorySkeleton, setInventorySkeleton] = useState(true);

  useEffect(() => {
    setInventorySkeleton(false);
  }, []);

  const daysLeft = useMemo(() => calendarDaysUntilDeadline(), []);
  const countdownStyle = countdownColor(daysLeft);

  const systemsNeedingConformity = 3;

  const selectedClassification = CLASSIFICATIONS[selectedSystemId];
  const selectedSystem = SYSTEMS.find((s) => s.id === selectedSystemId);

  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', color: "#e2e8f4", minHeight: "calc(100vh - 120px)" }}>
      <header style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: '"Syne", sans-serif',
            fontWeight: 700,
            fontSize: 24,
            margin: 0,
            color: "#f1f5f9",
          }}
        >
          AI Systems
        </h1>
        <p style={{ fontSize: 13, color: "var(--dim)", marginTop: 8, maxWidth: 480 }}>
          EU AI Act compliance inventory and risk classification
        </p>
      </header>

      <div
        style={{
          padding: 18,
          borderRadius: 12,
          background: "linear-gradient(135deg, #450a0a 0%, #1c1410 100%)",
          border: "1px solid #b45309",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fecaca" }}>⚠ EU AI Act High-Risk Obligations</div>
        <div style={{ fontSize: 13, color: "#fde68a", marginTop: 6 }}>Apply from 2 August 2026</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: countdownStyle, marginTop: 10 }}>
          {daysLeft} days remaining
        </div>
        <p style={{ fontSize: 13, color: "#cbd5e1", marginTop: 10, marginBottom: 0 }}>
          {systemsNeedingConformity} systems require conformity assessment before this deadline
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
        {[
          { label: "6 Systems Inventoried", color: "#e2e8f4" },
          { label: "3 High Risk", color: "#f87171" },
          { label: "2 Unclassified", color: "#94a3b8" },
          { label: "1 Compliant", color: "#4ade80" },
        ].map((p) => (
          <span
            key={p.label}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              background: "#0f172a",
              border: "1px solid #1e2e48",
              fontSize: 12,
              color: p.color,
            }}
          >
            {p.label}
          </span>
        ))}
      </div>

      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 24,
          borderBottom: "1px solid #141e30",
        }}
      >
        {(
          [
            ["inventory", "Inventory"],
            ["classification", "Classification"],
            ["obligations", "Obligations"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            style={{
              padding: "10px 0",
              marginBottom: -1,
              border: "none",
              borderBottom: tab === key ? "2px solid #2dd4bf" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === key ? 600 : 400,
              color: tab === key ? "#f8fafc" : "var(--dim)",
              fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "inventory" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {/* Empty state — uncomment when systems are loaded from API:
          {!inventorySkeleton && systems.length === 0 && (
            <AISystemsEmpty
              onAddSystem={handleAddSystem}
              onViewObligations={() => setTab("obligations")}
            />
          )}
          */}
          {inventorySkeleton
            ? [1, 2, 3, 4, 5, 6].map((i) => <AISystemCardSkeleton key={i} />)
            : SYSTEMS.map((sys) => (
                <article
                  key={sys.id}
                  style={{
                    padding: 18,
                    background: "#0b1220",
                    border: "1px solid #141e30",
                    borderRadius: 10,
                    ...cardBorder(sys.risk),
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 8 }}>
                    {sys.icon} {sys.name}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        background:
                          sys.risk === "HIGH"
                            ? "#450a0a"
                            : sys.risk === "LIMITED"
                              ? "#422006"
                              : sys.risk === "MINIMAL"
                                ? "#14532d"
                                : "#1e293b",
                        color:
                          sys.risk === "HIGH"
                            ? "#fca5a5"
                            : sys.risk === "LIMITED"
                              ? "#fde68a"
                              : sys.risk === "MINIMAL"
                                ? "#86efac"
                                : "#94a3b8",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {sys.risk === "UNCLASSIFIED" ? "UNCLASSIFIED" : `${sys.risk} RISK`}
                    </span>
                    <span style={{ padding: "2px 8px", borderRadius: 4, background: "#141e30", color: "#94a3b8", fontSize: 10 }}>
                      [{sys.annex}]
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                    <div>
                      <strong style={{ color: "#64748b" }}>Deployed by:</strong> {sys.entity}
                    </div>
                    <div>
                      <strong style={{ color: "#64748b" }}>Provider:</strong> {sys.provider}
                    </div>
                    <div>
                      <strong style={{ color: "#64748b" }}>Use case:</strong> {sys.use_case}
                    </div>
                    <div>
                      <strong style={{ color: "#64748b" }}>Data:</strong> {sys.data}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <strong style={{ color: "#64748b" }}>Conformity:</strong> {sys.conformity}
                    </div>
                    <div style={{ marginTop: 6, color: "#f8fafc" }}>Status: {statusLabel(sys.status)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setTab("classification");
                        setSelectedSystemId(sys.id);
                      }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: "1px solid #2dd4bf",
                        background: "transparent",
                        color: "#2dd4bf",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Classify →
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTab("obligations");
                        setSelectedSystemId(sys.id);
                      }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: "1px solid #3b82f6",
                        background: "#1e3a5f",
                        color: "#93c5fd",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      View Obligations →
                    </button>
                  </div>
                </article>
              ))}
        </div>
      )}

      {tab === "classification" && (
        <div>
          <h2 style={{ fontFamily: '"Syne", sans-serif', fontSize: 18, margin: "0 0 8px", color: "#f8fafc" }}>
            EU AI Act Risk Classification
          </h2>
          <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 16, maxWidth: 560 }}>
            Annex III classification with reasoning grounded in ISO 42001 and EU AI Act Article 6
          </p>
          <label style={{ fontSize: 12, color: "#94a3b8" }} htmlFor="sys-class-select">
            Select system
          </label>
          <select
            id="sys-class-select"
            value={selectedSystemId}
            onChange={(e) => setSelectedSystemId(e.target.value)}
            style={{
              display: "block",
              marginTop: 8,
              marginBottom: 20,
              padding: "10px 14px",
              minWidth: 280,
              borderRadius: 8,
              background: "#090e1a",
              border: "1px solid #1e2e48",
              color: "#e2e8f4",
              fontSize: 13,
            }}
          >
            {SYSTEMS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {selectedClassification && selectedSystem && (
            <div
              style={{
                padding: 22,
                background: "#0b1220",
                border: "1px solid #1e2e48",
                borderRadius: 12,
                maxWidth: 720,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2dd4bf", letterSpacing: "0.06em" }}>
                CLASSIFICATION RESULT
              </div>
              <div style={{ marginTop: 14, fontSize: 14, color: "#f8fafc" }}>
                <strong>System:</strong> {selectedSystem.name}
              </div>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                <strong>Risk Level:</strong> {selectedClassification.riskDisplay} ●
              </div>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                <strong>Annex III:</strong> {selectedClassification.annex}
              </div>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                <strong>Confidence:</strong> {selectedClassification.confidence.toFixed(2)}
              </div>
              <div style={{ marginTop: 18, fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>
                Classification reasoning
              </div>
              <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6, marginTop: 8 }}>
                {selectedClassification.reasoning}
              </p>
              <div style={{ marginTop: 18, fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>
                ISO 42001 mapping
              </div>
              <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6, marginTop: 8 }}>
                {selectedClassification.isoMapping}
              </p>
              <div style={{ marginTop: 18, fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>
                Relevant articles
              </div>
              <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 8 }}>{selectedClassification.articles}</p>
              <div
                style={{
                  marginTop: 20,
                  padding: "10px 12px",
                  background: "#164e63",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#2dd4bf",
                  fontWeight: 600,
                }}
              >
                SKILL SOURCE: ISO 42001 skill loaded
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "obligations" && (
        <div>
          <h2 style={{ fontFamily: '"Syne", sans-serif', fontSize: 18, margin: "0 0 8px", color: "#f8fafc" }}>
            Obligation Mapping
          </h2>
          <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 20, maxWidth: 520 }}>
            What each high-risk system must comply with by Aug 2026
          </p>
          {(["hr-screening", "cortex-engine", "anomaly"] as const).map((sid) => {
            const sys = SYSTEMS.find((s) => s.id === sid)!;
            const rows = OBLIGATION_PRESETS[sid] ?? HR_OBLIGATIONS;
            const readiness = READINESS[sid] ?? 0;
            return (
              <div key={sid} style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#f8fafc", marginBottom: 12 }}>
                  System: {sys.name}{" "}
                  <span style={{ fontSize: 13, color: "#2dd4bf", fontWeight: 500 }}>
                    · {readiness}% ready · {daysLeft} days to deadline
                  </span>
                </div>
                <div
                  style={{
                    padding: 18,
                    background: "#0b1220",
                    border: "1px solid #141e30",
                    borderRadius: 10,
                    borderLeft: "4px solid #ef4444",
                  }}
                >
                  {rows.map((row) => {
                    const st = obligationRowStyle(row, daysLeft);
                    return (
                      <div
                        key={row.article}
                        style={{
                          paddingBottom: 14,
                          marginBottom: 14,
                          borderBottom: "1px solid #141e30",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
                          {row.article} — {row.label}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 6, color: st.color }}>
                          Status: {st.statusText}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                          Due: 2 Aug 2026 · Effort: {row.effort}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
