import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { uploadEvidence } from "../api/client";
import { useComplianceMappings, useComplianceOverview } from "../api/compliance";
import { Breadcrumb } from "../components/ui/Breadcrumb";
import { FileUpload } from "../components/ui/FileUpload";
import { Modal } from "../components/ui/Modal";
import { useOrgContext } from "../hooks/useOrgContext";
import { frameworkQueryKey, useFramework } from "../hooks/useFrameworks";
import { invalidateComplianceData } from "../store/complianceStore";

export function FrameworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { orgId } = useOrgContext();
  const queryClient = useQueryClient();
  const [evidenceControlId, setEvidenceControlId] = useState<string | null>(null);
  const { data: framework, isLoading, error } = useFramework(id ?? null);
  const { data: mappings } = useComplianceMappings();
  const { data: overview } = useComplianceOverview(orgId, id ?? "");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-cortex-muted">Loading framework…</p>
      </div>
    );
  }

  if (error || !framework) {
    const isAuthError =
      error instanceof Error &&
      (error.message.includes("Invalid or expired token") || error.message.includes("Not authenticated"));
    return (
      <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-red-200">
        <p className="font-medium text-red-100">Failed to load framework</p>
        <p className="mt-1 text-sm text-red-300/90">{error instanceof Error ? error.message : "Not found"}</p>
        {isAuthError ? (
          <p className="mt-2 text-sm text-red-300/80">Your session may have expired. Sign in again.</p>
        ) : (
          <p className="mt-2 text-sm text-red-300/80">
            Make sure the API is running. From repo root:{" "}
            <code className="rounded bg-red-950/80 px-1.5 py-0.5 font-mono text-xs text-red-200">
              ./scripts/run-api.sh
            </code>
          </p>
        )}
        <Link
          to="/frameworks"
          className="mt-3 inline-block text-sm font-medium text-red-300 hover:text-red-100 hover:underline"
        >
          ← Back to frameworks
        </Link>
      </div>
    );
  }

  return (
    <div className="text-cortex-text">
      <Breadcrumb
        items={[{ label: "Frameworks", href: "/frameworks" }, { label: framework.name }]}
      />
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-cortex-text" style={{ fontFamily: "var(--font-sans)" }}>
          {framework.name}
        </h2>
        <p className="mt-1 text-sm text-cortex-muted">
          v{framework.version} · {framework.jurisdiction}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {framework.purpose_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-cortex-border bg-cortex-panel px-2 py-0.5 text-xs text-cortex-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <h3 className="mb-3 text-base font-semibold text-cortex-text">
        Controls ({framework.controls.length})
      </h3>
      <ul className="space-y-3">
        {framework.controls.map((c) => {
          // Look up assessed posture for this control in the overview
          const assessedControl = overview?.controls.find(
            (oc) => oc.ref === c.id || oc.ref.toLowerCase() === c.id.toLowerCase()
          );

          // Find mapped controls (either source or target)
          const relatedMappings = (mappings ?? []).filter((m) => {
            const isSource =
              (m.source_framework === id || m.source_framework.toLowerCase() === id?.toLowerCase()) &&
              m.source_control.toLowerCase() === c.id.toLowerCase();
            const isTarget =
              (m.target_framework === id || m.target_framework.toLowerCase() === id?.toLowerCase()) &&
              m.target_control.toLowerCase() === c.id.toLowerCase();
            return isSource || isTarget;
          });

          return (
            <li
              key={c.id}
              className="rounded-lg border border-cortex-border bg-cortex-card p-4 shadow-sm transition-colors hover:border-cortex-border"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold uppercase text-cortex-muted">
                      {c.id}
                    </span>
                    <p className="font-medium text-cortex-text">{c.name}</p>
                    {assessedControl && (
                      assessedControl.source_type === "INHERITED" ? (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-indigo-950/70 px-2 py-0.5 text-xs font-medium text-indigo-300 border border-indigo-700/50"
                          title={
                            assessedControl.inherited_from
                              ? `Inherited from ${assessedControl.inherited_from.framework.toUpperCase()} control ${assessedControl.inherited_from.control} (${assessedControl.inherited_from.relationship ?? "MAPPED"})`
                              : "Satisfied via cross-framework mapping"
                          }
                        >
                          <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          Inherited via {assessedControl.inherited_from?.framework.toUpperCase() ?? "Cross-Mapping"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 px-2 py-0.5 text-xs font-medium text-emerald-300 border border-emerald-700/40">
                          Direct Evidence
                        </span>
                      )
                    )}
                  </div>
                  {c.domain && <p className="mt-1 text-sm text-cortex-muted">{c.domain}</p>}
                  <p className="mt-1 text-xs text-cortex-muted">
                    {c.requirements.length} requirement{c.requirements.length !== 1 ? "s" : ""}
                  </p>

                  {/* Cross-framework mapping tags */}
                  {relatedMappings.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-cortex-muted mr-1">
                        Cross-mapped to:
                      </span>
                      {relatedMappings.map((m, idx) => {
                        const isSource =
                          (m.source_framework === id || m.source_framework.toLowerCase() === id?.toLowerCase()) &&
                          m.source_control.toLowerCase() === c.id.toLowerCase();
                        const otherFw = isSource ? m.target_framework : m.source_framework;
                        const otherCtrl = isSource ? m.target_control : m.source_control;
                        return (
                          <span
                            key={idx}
                            title={m.basis ? `${m.relationship}: ${m.basis}` : m.relationship}
                            className="inline-flex items-center gap-1 rounded border border-blue-900/50 bg-blue-950/40 px-2 py-0.5 text-[11px] font-mono text-blue-300"
                          >
                            <span className="font-semibold">{otherFw.toUpperCase()}</span>
                            <span>{otherCtrl}</span>
                            <span className="text-[10px] text-blue-400/80">({m.relationship})</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEvidenceControlId(c.id)}
                  className="shrink-0 rounded border border-cortex-border bg-cortex-panel px-3 py-1.5 font-ui text-sm text-cortex-text hover:bg-cortex-card-hover"
                >
                  Attach Evidence
                </button>
              </div>
            </li>
          );
        })}
      </ul>


      <Modal open={evidenceControlId != null} onClose={() => setEvidenceControlId(null)} size="md">
        <Modal.Header
          title="Attach evidence"
          onClose={() => setEvidenceControlId(null)}
        />
        <Modal.Body>
          {evidenceControlId != null && id != null ? (
            <FileUpload
              key={evidenceControlId}
              label={`Upload for control ${evidenceControlId}`}
              onUpload={async (file, onProgress) => {
                await uploadEvidence(
                  file,
                  {
                    org_id: orgId,
                    framework_id: id,
                    control_id: evidenceControlId,
                  },
                  { onProgress }
                );
                await queryClient.invalidateQueries({ queryKey: frameworkQueryKey(id) });
                invalidateComplianceData(queryClient, orgId);
                window.setTimeout(() => setEvidenceControlId(null), 1000);
              }}
            />
          ) : null}
        </Modal.Body>
      </Modal>
    </div>
  );
}
