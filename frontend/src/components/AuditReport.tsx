export type ReportFramework = {
  name: string;
  score: number;
  status: string;
  risk: string;
};

export type ReportFinding = {
  title: string;
  framework: string;
  owner: string;
  days_open: number;
  due: string;
};

export type ReportData = {
  org_name?: string;
  as_at?: string;
  overall_score?: number;
  audit_readiness?: number;
  risk_level?: string;
  critical_gaps?: number;
  findings_open?: number;
  frameworks?: ReportFramework[];
  top_findings?: ReportFinding[];
  recommendations?: string[];
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div style={{ marginBottom: "24px" }}>
    <div
      style={{
        color: "#4a5a72",
        fontSize: "11px",
        letterSpacing: "2px",
        marginBottom: "8px",
        borderBottom: "1px solid #1e2e48",
        paddingBottom: "4px",
      }}
    >
      {title}
    </div>
    {children}
  </div>
);

const DataRow = ({
  label,
  value,
  color = "#e2e8f4",
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "3px 0",
      fontSize: "12px",
      borderBottom: "1px solid #0c1220",
    }}
  >
    <span style={{ color: "#94a3b8" }}>{label}</span>
    <span style={{ color }}>{value}</span>
  </div>
);

type AuditReportProps = {
  report: ReportData | null;
  isLoading?: boolean;
  error?: string | null;
  onGenerate?: () => void;
};

export function AuditReport({ report, isLoading, error, onGenerate }: AuditReportProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-cortex-border bg-cortex-panel p-6 font-data text-sm text-cortex-muted">
        Loading executive summary…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-cortex-border bg-cortex-panel p-6 font-data text-sm text-cortex-amber">
        Report unavailable: {error}
      </div>
    );
  }

  if (onGenerate && !report) {
    return (
      <div className="rounded-xl border border-cortex-border bg-cortex-panel p-6">
        <p className="font-data text-sm text-cortex-muted mb-4">Generate a report to view the executive summary.</p>
        <button
          type="button"
          onClick={onGenerate}
          className="rounded-lg bg-cortex-blue px-4 py-2 font-ui text-sm font-medium text-white hover:bg-cortex-blue/90"
        >
          Generate
        </button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-xl border border-cortex-border bg-cortex-panel p-6 font-data text-sm text-cortex-muted">
        No summary data.
      </div>
    );
  }

  const overallScore = report.overall_score ?? 0;
  const riskLevel = report.risk_level ?? "MEDIUM";

  return (
    <div
      style={{
        fontFamily: "DM Mono, monospace",
        color: "#e2e8f4",
        padding: "24px",
      }}
      className="rounded-xl border border-cortex-border bg-cortex-panel"
    >
      <div
        style={{
          textAlign: "center",
          borderBottom: "1px solid #1e2e48",
          paddingBottom: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={{ color: "#94a3b8", fontSize: "12px", letterSpacing: "2px" }}>
          {(report.org_name ?? "Organisation").toUpperCase()}
        </div>
        <div style={{ color: "#94a3b8", fontSize: "12px" }}>
          INFORMATION SECURITY & COMPLIANCE
        </div>
        <div
          style={{
            color: "#e2e8f4",
            fontSize: "16px",
            fontWeight: "bold",
            marginTop: "8px",
          }}
        >
          EXECUTIVE SUMMARY
        </div>
        <div style={{ color: "#4a5a72", fontSize: "12px", marginTop: "4px" }}>
          As at: {report.as_at ?? "—"} · Classification: Board Confidential
        </div>
      </div>

      <Section title="OVERALL POSTURE">
        <DataRow
          label="Group Compliance Score"
          value={`${overallScore}%`}
          color={
            overallScore >= 70 ? "#10b981" : overallScore >= 50 ? "#f59e0b" : "#ef4444"
          }
        />
        <DataRow label="Audit Readiness" value={`${report.audit_readiness ?? 0}%`} />
        <DataRow
          label="Overall Risk Level"
          value={riskLevel}
          color={
            riskLevel === "CRITICAL"
              ? "#ef4444"
              : riskLevel === "HIGH"
                ? "#f59e0b"
                : "#10b981"
          }
        />
        <DataRow label="Frameworks Active" value="8" />
        <DataRow label="Total Controls Assessed" value="491" />
        <DataRow
          label="Critical Gaps"
          value={report.critical_gaps ?? 0}
          color="#ef4444"
        />
        <DataRow label="Findings Open" value={report.findings_open ?? 0} />
      </Section>

      <Section title="FRAMEWORK POSTURE SUMMARY">
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "12px",
          }}
        >
          <thead>
            <tr style={{ color: "#4a5a72", borderBottom: "1px solid #1e2e48" }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Framework</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Score</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Status</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Risk</th>
            </tr>
          </thead>
          <tbody>
            {(report.frameworks ?? []).map((fw, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #0c1220" }}>
                <td style={{ padding: "6px 8px" }}>{fw.name}</td>
                <td
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    color:
                      fw.score >= 70 ? "#10b981" : fw.score >= 50 ? "#f59e0b" : "#ef4444",
                  }}
                >
                  {fw.score}%
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    color: "#f59e0b",
                    fontSize: "11px",
                  }}
                >
                  {fw.status}
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    color:
                      fw.risk === "CRITICAL"
                        ? "#ef4444"
                        : fw.risk === "HIGH"
                          ? "#f59e0b"
                          : "#10b981",
                    fontSize: "11px",
                  }}
                >
                  {fw.risk}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="TOP CRITICAL FINDINGS">
        {(report.top_findings ?? []).length === 0 ? (
          <div style={{ padding: "4px 0", fontSize: "12px", color: "#4a5a72" }}>
            No critical findings recorded.
          </div>
        ) : (
          (report.top_findings ?? []).map((f, i) => (
            <div
              key={i}
              style={{
                padding: "4px 0",
                borderBottom: "1px solid #0c1220",
                fontSize: "12px",
              }}
            >
              <span style={{ color: "#ef4444" }}>{i + 1}. </span>
              <span>{f.title}</span>
              <span style={{ color: "#4a5a72" }}> — {f.framework}</span>
              <span style={{ color: "#4a5a72" }}> · Owner: {f.owner}</span>
              <span
                style={{
                  color: f.days_open > 30 ? "#ef4444" : "#f59e0b",
                }}
              >
                {" "}
                · Due: {f.due}
              </span>
            </div>
          ))
        )}
      </Section>

      <Section title="RECOMMENDATIONS">
        {(report.recommendations ?? []).length === 0 ? (
          <div style={{ padding: "4px 0", fontSize: "12px", color: "#4a5a72" }}>
            No recommendations in this report.
          </div>
        ) : (
          (report.recommendations ?? []).map((r, i) => (
            <div key={i} style={{ padding: "4px 0", fontSize: "12px" }}>
              <span style={{ color: "#3b82f6" }}>{i + 1}. </span>
              {r}
            </div>
          ))
        )}
      </Section>
    </div>
  );
}
