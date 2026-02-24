/**
 * Audit Report Generator — board-ready compliance report with PDF export.
 * Fetches posture, findings, ZTAIP; renders Executive Summary; print & copy.
 */

import { useState, useCallback } from "react";
import {
  fetchExecutiveSummary,
  DEFAULT_ORG_ID,
  type ExecutiveSummaryReport,
  type ExecutiveSummaryParams,
} from "../api/client";

const REPORT_TYPES = [
  { value: "executive-summary", label: "Executive Summary (Board)" },
  { value: "full-compliance", label: "Full Compliance Report (Auditor)" },
  { value: "gap-register", label: "Gap Register (Management)" },
  { value: "nis2-readiness", label: "NIS2 Readiness Report" },
  { value: "gdpr-compliance", label: "GDPR Compliance Report" },
] as const;

const ENTITY_SCOPES = [
  { value: "ALL", label: "All Entities" },
  { value: "DE", label: "DE" },
  { value: "UK", label: "UK" },
  { value: "AU", label: "AU" },
  { value: "TH", label: "TH" },
  { value: "ES", label: "ES" },
  { value: "US", label: "US" },
];

function formatDateForInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function statusColor(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "compliant" || s === "ready") return "text-cortex-green";
  if (s === "partial") return "text-cortex-amber";
  if (s === "non_compliant" || s === "not ready") return "text-cortex-red";
  return "text-cortex-muted";
}

function riskColor(risk: string): string {
  const r = (risk || "").toUpperCase();
  if (r === "LOW") return "text-cortex-green";
  if (r === "MEDIUM") return "text-cortex-amber";
  if (r === "HIGH" || r === "CRITICAL") return "text-cortex-red";
  return "text-cortex-muted";
}

export function AuditReport() {
  const [reportType, setReportType] = useState<string>(REPORT_TYPES[0].value);
  const [entityScope, setEntityScope] = useState<string>("ALL");
  const [asAt, setAsAt] = useState<string>(() => formatDateForInput(new Date()));
  const [report, setReport] = useState<ExecutiveSummaryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateReport = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params: ExecutiveSummaryParams = {
        org_id: DEFAULT_ORG_ID,
        as_at: asAt,
        entity_scope: entityScope === "ALL" ? undefined : entityScope,
      };
      const data = await fetchExecutiveSummary(params);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [asAt, entityScope]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const copyToClipboard = useCallback(() => {
    if (!report) return;
    const lines: string[] = [
      "═══════════════════════════════════════════════",
      "ASTRALABS GROUP",
      "INFORMATION SECURITY & COMPLIANCE",
      "EXECUTIVE SUMMARY",
      `As at: ${report.as_at}`,
      "Classification: Board Confidential",
      "═══════════════════════════════════════════════",
      "",
      "OVERALL POSTURE",
      "───────────────",
      `Group Compliance Score:    ${report.overall_posture.group_compliance_score}%`,
      `Audit Readiness:           ${report.overall_posture.audit_readiness}%`,
      `Overall Risk Level:        ${report.overall_posture.overall_risk_level}`,
      `Frameworks Active:         ${report.overall_posture.frameworks_active}`,
      `Total Controls Assessed:   ${report.overall_posture.total_controls_assessed}`,
      `Critical Gaps:             ${report.overall_posture.critical_gaps}`,
      `Findings Open:             ${report.overall_posture.findings_open}`,
      `Findings Overdue:          ${report.overall_posture.findings_overdue}`,
      "",
      "FRAMEWORK POSTURE SUMMARY",
      "─────────────────────────",
    ];
    report.framework_summary.forEach((fw) => {
      lines.push(
        `${(fw.framework_name || "").padEnd(28)} ${String(fw.score ?? "-").padStart(4)}%   ${(fw.status || "").padEnd(14)} ${fw.risk_level || ""}`
      );
    });
    lines.push("", "TOP 5 CRITICAL FINDINGS", "───────────────────────");
    report.top_critical_findings.forEach((f, i) => {
      lines.push(
        `${i + 1}. ${f.title} — ${f.framework} — Owner: ${f.owner}`,
        `   Due: ${f.due_date} · ${f.days_open} days open`
      );
    });
    lines.push("", "REGULATORY EXPOSURE", "──────────────────");
    Object.entries(report.regulatory_exposure || {}).forEach(([k, v]) => {
      lines.push(`${k.replace(/_/g, " ")}:     ${v}`);
    });
    lines.push("", "MANAGEMENT ATTENTION REQUIRED", "─────────────────────────────");
    (report.management_attention || []).forEach((m) => lines.push(`· ${m}`));
    lines.push("", "RECOMMENDATIONS", "───────────────");
    (report.recommendations || []).forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    lines.push(
      "",
      "═══════════════════════════════════════════════",
      "Prepared by: CORTEX Intelligence Platform",
      "Approved by: Group CISO",
      `Next review: ${report.next_review}`,
      "═══════════════════════════════════════════════"
    );
    const text = lines.join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [report]);

  return (
    <div className="space-y-6 print:space-y-0">
      {/* Config panel — hidden when printing */}
      <div className="report-controls rounded-xl border border-cortex-border bg-cortex-surface p-6 print:hidden no-print">
        <h1 className="font-ui text-2xl font-semibold text-cortex-text">Audit Report Generator</h1>
        <p className="mt-1 font-ui text-sm text-cortex-muted">
          Generate board-ready compliance reports for AstraLabs Group
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block font-data text-xs uppercase tracking-wider text-cortex-muted">
              Report type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-64 rounded border border-cortex-border bg-cortex-panel px-3 py-2 font-ui text-sm text-cortex-text"
            >
              {REPORT_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-data text-xs uppercase tracking-wider text-cortex-muted">
              Entity scope
            </label>
            <select
              value={entityScope}
              onChange={(e) => setEntityScope(e.target.value)}
              className="w-40 rounded border border-cortex-border bg-cortex-panel px-3 py-2 font-ui text-sm text-cortex-text"
            >
              {ENTITY_SCOPES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-data text-xs uppercase tracking-wider text-cortex-muted">
              As at date
            </label>
            <input
              type="date"
              value={asAt}
              onChange={(e) => setAsAt(e.target.value)}
              className="rounded border border-cortex-border bg-cortex-panel px-3 py-2 font-ui text-sm text-cortex-text"
            />
          </div>
          <button
            type="button"
            onClick={generateReport}
            disabled={loading}
            className="rounded-lg bg-gradient-to-r from-cortex-blue to-cortex-blue/90 px-4 py-2 font-ui text-sm font-semibold text-white shadow-lg transition hover:from-cortex-blue/95 hover:to-cortex-blue/85 disabled:opacity-60"
          >
            {loading ? "Generating…" : "Generate Report"}
          </button>
          {report && (
            <>
              <button
                type="button"
                onClick={handlePrint}
                className="rounded-lg border border-cortex-border bg-cortex-panel px-4 py-2 font-ui text-sm font-semibold text-cortex-text transition hover:bg-cortex-border"
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={copyToClipboard}
                className="rounded-lg border border-cortex-border bg-cortex-panel px-4 py-2 font-ui text-sm font-semibold text-cortex-text transition hover:bg-cortex-border"
              >
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
            </>
          )}
        </div>
        {error && (
          <div className="mt-4 rounded border border-cortex-red/50 bg-cortex-red/10 px-3 py-2 font-ui text-sm text-cortex-red">
            {error}
          </div>
        )}
      </div>

      {/* Report preview — visible in screen and print */}
      <div className="audit-report-preview rounded-xl border border-cortex-border bg-cortex-panel p-6 font-mono text-sm">
        {!report && !loading && (
          <p className="font-ui text-cortex-muted">Select options and click Generate Report to see the preview.</p>
        )}
        {loading && <p className="font-ui text-cortex-muted">Loading report…</p>}
            {report && (
          <div className="space-y-4 text-cortex-text report-content">
            {/* Report header — logo lockup left, classification right (light variant for PDF) */}
            <div
              className="report-logo report-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "32px",
                paddingBottom: "24px",
                borderBottom: "2px solid #2dd4bf40",
              }}
            >
              <div
                className="report-logo-brand"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "18px",
                  padding: "16px 24px",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 58, 138, 0.12) 100%)",
                  border: "1px solid rgba(45, 212, 191, 0.25)",
                }}
              >
                {/* Radar Arc C — light-optimised for white PDF */}
                <svg
                  className="report-logo-svg"
                  width="52"
                  height="52"
                  viewBox="0 0 80 80"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M 13 40 A 27 27 0 1 1 67 40"
                    stroke="#0e7490"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 21 40 A 19 19 0 1 1 59 40"
                    stroke="#0891b2"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.75"
                  />
                  <path
                    d="M 29 40 A 11 11 0 1 1 51 40"
                    stroke="#06b6d4"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.5"
                  />
                  <path
                    d="M 35 40 A 5 5 0 1 1 45 40"
                    stroke="#22d3ee"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.3"
                  />
                  <circle cx="40" cy="40" r="4" fill="#0e7490" />
                  <line
                    x1="40"
                    y1="40"
                    x2="65"
                    y2="31"
                    stroke="#0891b2"
                    strokeWidth="1"
                    opacity="0.4"
                    strokeLinecap="round"
                  />
                  <circle cx="65" cy="31" r="1.5" fill="#0891b2" opacity="0.5" />
                  <circle cx="13" cy="40" r="2.5" fill="#0e7490" opacity="0.4" />
                  <circle cx="67" cy="40" r="2.5" fill="#0e7490" opacity="0.4" />
                </svg>
                <div>
                  <div
                    className="report-logo-wordmark"
                    style={{
                      fontFamily: "'Syne', 'DM Sans', sans-serif",
                      fontWeight: 800,
                      fontSize: "22px",
                      letterSpacing: "5px",
                      color: "#e2e8f4",
                      lineHeight: 1,
                    }}
                  >
                    CORTEX
                  </div>
                  <div
                    className="report-logo-tagline subtitle"
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: "10px",
                      letterSpacing: "3px",
                      color: "#2dd4bf",
                      marginTop: "4px",
                      textTransform: "uppercase",
                    }}
                  >
                    Zero Trust AI Platform
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div
                  className="classification-badge"
                  style={{
                    display: "inline-block",
                    padding: "4px 12px",
                    background: "transparent",
                    border: "1px solid #dc2626",
                    borderRadius: "4px",
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "10px",
                    letterSpacing: "2px",
                    color: "#dc2626",
                    marginBottom: "8px",
                  }}
                >
                  BOARD CONFIDENTIAL
                </div>
                <div
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "11px",
                    color: "#4a5a72",
                    lineHeight: 1.6,
                  }}
                >
                  <div>AstraLabs Group</div>
                  <div>As at: {report?.as_at ?? new Date().toISOString().split("T")[0]}</div>
                  <div>Prepared by CORTEX Intelligence</div>
                </div>
              </div>
            </div>

            <div className="font-ui font-semibold uppercase tracking-wider text-cortex-muted text-center pb-2">
              EXECUTIVE SUMMARY
            </div>

            <section>
              <h2 className="font-data text-xs uppercase tracking-wider text-cortex-muted">
                OVERALL POSTURE
              </h2>
              <div className="mt-1 grid gap-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-cortex-muted">Group Compliance Score</span>
                  <span>{report.overall_posture.group_compliance_score}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cortex-muted">Audit Readiness</span>
                  <span>{report.overall_posture.audit_readiness}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cortex-muted">Overall Risk Level</span>
                  <span className={riskColor(report.overall_posture.overall_risk_level ?? "")}>
                    {report.overall_posture.overall_risk_level}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cortex-muted">Frameworks Active</span>
                  <span>{report.overall_posture.frameworks_active}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cortex-muted">Total Controls Assessed</span>
                  <span>{report.overall_posture.total_controls_assessed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cortex-muted">Critical Gaps</span>
                  <span>{report.overall_posture.critical_gaps}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cortex-muted">Findings Open</span>
                  <span>{report.overall_posture.findings_open}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cortex-muted">Findings Overdue</span>
                  <span className={report.overall_posture.findings_overdue ? "text-cortex-red" : ""}>
                    {report.overall_posture.findings_overdue}
                  </span>
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-data text-xs uppercase tracking-wider text-cortex-muted">
                FRAMEWORK POSTURE SUMMARY
              </h2>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-cortex-border text-left text-cortex-muted">
                      <th className="py-1 pr-4">Framework</th>
                      <th className="py-1 pr-2">Score</th>
                      <th className="py-1 pr-2">Status</th>
                      <th className="py-1">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.framework_summary.map((fw) => (
                      <tr key={fw.framework_name} className="border-b border-cortex-border/50">
                        <td className="py-1 pr-4 text-cortex-text">{fw.framework_name}</td>
                        <td className="py-1 pr-2">{fw.score != null ? `${fw.score}%` : "—"}</td>
                        <td className={`py-1 pr-2 ${statusColor(fw.status)}`}>{fw.status}</td>
                        <td className={`py-1 ${riskColor(fw.risk_level)}`}>{fw.risk_level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="font-data text-xs uppercase tracking-wider text-cortex-muted">
                TOP 5 CRITICAL FINDINGS
              </h2>
              <ul className="mt-2 list-decimal space-y-2 pl-5 font-mono text-xs">
                {report.top_critical_findings.map((f, i) => (
                  <li key={i} className="text-cortex-text">
                    <span className="font-medium">{f.title}</span> — {f.framework} — Owner: {f.owner}
                    <br />
                    <span className="text-cortex-muted">
                      Due: {f.due_date} · {f.days_open} days open
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="font-data text-xs uppercase tracking-wider text-cortex-muted">
                REGULATORY EXPOSURE
              </h2>
              <div className="mt-2 space-y-1 font-mono text-xs">
                {report.regulatory_exposure &&
                  Object.entries(report.regulatory_exposure).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-cortex-muted">{key.replace(/_/g, " ")}</span>
                      <span className={statusColor(value)}>{value}</span>
                    </div>
                  ))}
              </div>
            </section>

            <section>
              <h2 className="font-data text-xs uppercase tracking-wider text-cortex-muted">
                MANAGEMENT ATTENTION REQUIRED
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs text-cortex-text">
                {(report.management_attention || []).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="font-data text-xs uppercase tracking-wider text-cortex-muted">
                RECOMMENDATIONS
              </h2>
              <ol className="mt-2 list-decimal space-y-1 pl-5 font-mono text-xs text-cortex-text">
                {(report.recommendations || []).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </section>

            {/* Report footer */}
            <div
              className="report-footer"
              style={{
                marginTop: "48px",
                paddingTop: "20px",
                borderTop: "1px solid #1e2e48",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div
                className="report-footer-logo"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <svg
                  className="report-logo-svg"
                  width="18"
                  height="18"
                  viewBox="0 0 80 80"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M 13 40 A 27 27 0 1 1 67 40"
                    stroke="#0e7490"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 23 40 A 17 17 0 1 1 57 40"
                    stroke="#0891b2"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.6"
                  />
                  <path
                    d="M 33 40 A 7 7 0 1 1 47 40"
                    stroke="#06b6d4"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.35"
                  />
                  <circle cx="40" cy="40" r="5" fill="#0e7490" />
                </svg>
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "11px",
                    letterSpacing: "2px",
                    color: "#4a5a72",
                    fontWeight: 600,
                  }}
                >
                  CORTEX
                </span>
              </div>

              <div
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "10px",
                  color: "#4a5a72",
                  textAlign: "center",
                  letterSpacing: "1px",
                }}
              >
                Generated by CORTEX Zero Trust AI Platform
                · Confidential · Not for distribution
              </div>

              <div
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "10px",
                  color: "#4a5a72",
                  letterSpacing: "1px",
                }}
              >
                {new Date().toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
