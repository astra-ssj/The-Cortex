import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { uploadEvidence } from "../api/client";
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
        {framework.controls.map((c) => (
          <li
            key={c.id}
            className="rounded-lg border border-cortex-border bg-cortex-card p-4 shadow-sm transition-colors hover:border-cortex-border"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-cortex-text">{c.name}</p>
                {c.domain && <p className="text-sm text-cortex-muted">{c.domain}</p>}
                <p className="mt-2 text-sm text-cortex-muted">
                  {c.requirements.length} requirement{c.requirements.length !== 1 ? "s" : ""}
                </p>
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
        ))}
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
