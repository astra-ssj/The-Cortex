import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_ORG_ID } from "../api/client";
import { reportsApi } from "../api/client";
import { useCompliancePosture } from "../store/complianceStore";
import { AuditReport, type ReportData } from "./AuditReport";

export default function AuditReportPage(_props: { token?: string | null }) {
  const { data: posture } = useCompliancePosture(DEFAULT_ORG_ID);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const { data: summary, isLoading, error, refetch } = useQuery({
    queryKey: ["executive-summary"],
    queryFn: () => reportsApi.getExecutiveSummary(),
    retry: false,
  });

  function buildReport(summaryData: Record<string, unknown> | undefined) {
    const sum = summaryData ?? (summary && typeof summary === "object" ? (summary as Record<string, unknown>) : {});
    const frameworks = (posture?.frameworks ?? []).map((fw) => ({
      name: fw.frameworkName ?? "",
      score: fw.score ?? 0,
      status: fw.status ?? "PARTIAL",
      risk: fw.riskLevel ?? "MEDIUM",
    }));
    let criticalGaps = 0;
    posture?.frameworks?.forEach((fw) => {
      criticalGaps += fw.gapCount ?? 0;
    });
    const asAt =
      typeof sum.generated_at === "string" ? sum.generated_at : posture?.lastAssessed ?? new Date().toISOString();
    const recs: string[] = typeof sum.summary === "string" ? [sum.summary] : [];
    return {
      org_name: posture?.organisationName,
      as_at: asAt,
      overall_score: posture?.overallScore,
      audit_readiness: posture?.auditReadiness,
      risk_level: posture?.frameworks?.some((f) => f.riskLevel === "CRITICAL") ? "CRITICAL" : "HIGH",
      critical_gaps: criticalGaps,
      findings_open: 0,
      frameworks,
      top_findings: [],
      recommendations: recs.length ? recs : undefined,
    };
  }

  const onGenerate = () => {
    refetch().then(({ data }) => {
      const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
      setReportData(buildReport(raw));
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="font-ui text-xl font-semibold text-cortex-text">Audit Report</h1>
      <AuditReport
        report={reportData}
        isLoading={isLoading}
        error={error != null ? (error instanceof Error ? error.message : String(error)) : null}
        onGenerate={onGenerate}
      />
    </div>
  );
}
