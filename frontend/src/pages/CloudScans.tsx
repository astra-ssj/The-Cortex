import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgContext } from "../hooks/useOrgContext";
import { shastaCloudApi, type ShastaEvidenceMapOut, type ShastaScanRunRow } from "../api/client";
import { SHASTA_EVIDENCE_MAP_SAMPLE } from "../lib/shastaEvidenceMapMock";
import { buildEvidenceMapRows } from "../lib/shastaEvidenceMapRows";

function ComplianceEvidenceMapBlock({
  mapOut,
  loading,
  error,
  isSample,
  marginTop = 28,
}: {
  mapOut?: ShastaEvidenceMapOut;
  loading?: boolean;
  error?: Error | null;
  isSample?: boolean;
  marginTop?: number;
}) {
  const rows = useMemo(() => (mapOut ? buildEvidenceMapRows(mapOut) : []), [mapOut]);

  return (
    <div
      style={{
        marginTop,
        paddingTop: marginTop > 0 ? 22 : 0,
        borderTop: marginTop > 0 ? "1px solid #1e293b" : undefined,
      }}
    >
      {isSample && (
        <div
          role="status"
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid rgba(251, 191, 36, 0.45)",
            background: "rgba(251, 191, 36, 0.08)",
            fontSize: 12,
            color: "#fcd34d",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "#fde68a" }}>Sample data.</strong> Illustrative finding → control mapping
          only — not loaded from your organisation or live cloud scans. Toggle off anytime.
        </div>
      )}
      <h3
        style={{
          fontSize: 14,
          color: "#94a3b8",
          marginBottom: 8,
          fontFamily: '"Syne", sans-serif',
          fontWeight: 600,
        }}
      >
        Compliance evidence map
      </h3>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 14, maxWidth: 720, lineHeight: 1.5 }}>
        Each finding links to framework control references supplied by Shasta (
        <code style={{ fontSize: 11, color: "#5eead4" }}>framework_controls</code>
        ). Source is always this engine — not merged with other connector evidence types.
      </p>
      {!isSample && loading && <p style={{ color: "#64748b", fontSize: 13 }}>Loading evidence map…</p>}
      {!isSample && error && (
        <p style={{ color: "#f87171", fontSize: 13 }}>{error.message}</p>
      )}
      {mapOut && (
        <>
          <div
            style={{
              marginBottom: 12,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              fontSize: 12,
              color: "#94a3b8",
            }}
          >
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                background: "#0f172a",
                border: "1px solid #334155",
              }}
            >
              Source: <strong style={{ color: "#e2e8f4" }}>Shasta</strong>
              {isSample && (
                <span style={{ color: "#94a3b8", fontWeight: 400 }}> · demo payload</span>
              )}
            </span>
            <span>
              Scan: {mapOut.scan_status}
              {mapOut.cloud ? ` · ${mapOut.cloud}` : ""}
            </span>
            <span>
              {mapOut.summary.findings} findings · {mapOut.summary.control_nodes} control nodes ·{" "}
              {mapOut.summary.edges} links
            </span>
          </div>
          {mapOut.summary.edges === 0 && (
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
              No framework control tags on these rows yet — mappings appear when Shasta populates{" "}
              <code style={{ fontSize: 11 }}>framework_controls</code>.
            </p>
          )}
          {rows.length > 0 && (
            <div style={{ overflowX: "auto", border: "1px solid #141e30", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#0f172a", textAlign: "left" }}>
                    <th style={{ padding: 10 }}>Severity</th>
                    <th style={{ padding: 10 }}>Finding</th>
                    <th style={{ padding: 10 }}>Mapped controls</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ fn, controls }) => (
                    <tr key={fn.id} style={{ borderTop: "1px solid #141e30", verticalAlign: "top" }}>
                      <td style={{ padding: 10, whiteSpace: "nowrap" }}>{fn.severity ?? "—"}</td>
                      <td style={{ padding: 10, maxWidth: 300 }}>
                        <div style={{ fontWeight: 600, color: "#e2e8f4" }}>{fn.label}</div>
                      </td>
                      <td style={{ padding: 10 }}>
                        {controls.length === 0 ? (
                          <span style={{ color: "#64748b" }}>—</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {controls.map((c) => (
                              <span
                                key={c.id}
                                style={{
                                  fontSize: 11,
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  background: "rgba(94, 234, 212, 0.08)",
                                  border: "1px solid rgba(94, 234, 212, 0.25)",
                                  color: "#99f6e4",
                                }}
                              >
                                {String(c.label ?? c.id)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CloudScans() {
  const { orgId } = useOrgContext();
  const qc = useQueryClient();
  const [pinnedScanId, setPinnedScanId] = useState<string | null>(null);
  const [detailScanId, setDetailScanId] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [sampleEvidenceMapOpen, setSampleEvidenceMapOpen] = useState(false);
  const prevStatusRef = useRef<Record<string, string>>({});

  const scansQuery = useQuery({
    queryKey: ["shasta-scans", orgId],
    queryFn: () => shastaCloudApi.listScans(orgId),
    retry: 1,
    refetchInterval: (query) => {
      const rows = query.state.data;
      if (!Array.isArray(rows) || rows.length === 0) return false;
      return rows.some((r) => r.status === "running") ? 3000 : false;
    },
  });

  const findingsQuery = useQuery({
    queryKey: ["shasta-findings", orgId],
    queryFn: () => shastaCloudApi.listRecentFindings(orgId),
    retry: 1,
    refetchInterval: () => {
      const scanRows = qc.getQueryData<ShastaScanRunRow[]>(["shasta-scans", orgId]);
      if (!scanRows?.some((r) => r.status === "running")) return false;
      return 4000;
    },
  });

  const detailFindingsQuery = useQuery({
    queryKey: ["shasta-scan-findings", orgId, detailScanId],
    queryFn: () =>
      detailScanId
        ? shastaCloudApi.listFindingsForScan(orgId, detailScanId)
        : Promise.resolve([]),
    enabled: Boolean(detailScanId),
    retry: 1,
  });

  const evidenceMapQuery = useQuery({
    queryKey: ["shasta-evidence-map", orgId, detailScanId],
    queryFn: () =>
      detailScanId
        ? shastaCloudApi.getEvidenceMap(orgId, detailScanId)
        : Promise.reject(new Error("no scan")),
    enabled: Boolean(detailScanId),
    retry: 1,
  });

  useEffect(() => {
    const rows = scansQuery.data;
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const prev = prevStatusRef.current[row.id];
      if (prev === "running" && row.status === "completed") {
        setScanNotice(`Scan completed — ${row.findings_count} findings stored.`);
      }
      if (prev === "running" && row.status === "failed") {
        const msg = row.error_message?.trim() || "unknown error";
        setScanNotice(`Scan failed: ${msg.length > 160 ? `${msg.slice(0, 160)}…` : msg}`);
      }
      prevStatusRef.current[row.id] = row.status;
    }
  }, [scansQuery.data]);

  const runMutation = useMutation({
    mutationFn: (cloud: "aws" | "azure") =>
      shastaCloudApi.runScan({ cloud, org_id: orgId }),
    onSuccess: (data) => {
      setPinnedScanId(data.scan_run_id);
      setScanNotice(null);
      prevStatusRef.current[data.scan_run_id] = "running";
      void qc.invalidateQueries({ queryKey: ["shasta-scans", orgId] });
      void qc.invalidateQueries({ queryKey: ["shasta-findings", orgId] });
    },
  });

  const runningAny =
    Array.isArray(scansQuery.data) &&
    scansQuery.data.some((r) => r.status === "running");

  return (
    <div
      style={{
        minHeight: "calc(100vh - 120px)",
        fontFamily: '"DM Sans", sans-serif',
        color: "#e2e8f4",
      }}
    >
      <style>{`
        @keyframes cortex-scan-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .cortex-scan-pulse {
          animation: cortex-scan-pulse 1.2s ease-in-out infinite;
        }
      `}</style>
      <header
        style={{
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: "1px solid #141e30",
        }}
      >
        <h1
          style={{
            fontFamily: '"Syne", sans-serif',
            fontWeight: 700,
            fontSize: 24,
            margin: 0,
            color: "#f1f5f9",
            display: "flex",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: "10px 14px",
          }}
        >
          <span>Cloud scans</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              fontFamily: '"Space Mono", monospace',
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#5eead4",
            }}
          >
            Powered by Shasta
          </span>
        </h1>
        <p
          style={{
            fontFamily: '"Space Mono", monospace',
            fontSize: 11,
            color: "#64748b",
            margin: "10px 0 0",
            maxWidth: 560,
            lineHeight: 1.5,
          }}
        >
          Deterministic CSPM via Transilience Shasta; findings persist to Postgres per organisation.
          Store AWS/Azure connector credentials under Integrations first.
        </p>
      </header>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <button
          type="button"
          disabled={runMutation.isPending}
          onClick={() => runMutation.mutate("aws")}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #1e3a5f",
            background: "#0c1526",
            color: "#93c5fd",
            cursor: runMutation.isPending ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          Run AWS scan
        </button>
        <button
          type="button"
          disabled={runMutation.isPending}
          onClick={() => runMutation.mutate("azure")}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #14532d",
            background: "#0c1526",
            color: "#86efac",
            cursor: runMutation.isPending ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          Run Azure scan
        </button>
        <button
          type="button"
          onClick={() => setSampleEvidenceMapOpen((v) => !v)}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #854d0e",
            background: sampleEvidenceMapOpen ? "#422006" : "#0c1526",
            color: "#fcd34d",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {sampleEvidenceMapOpen ? "Hide sample evidence map" : "Preview sample evidence map"}
        </button>
      </div>

      {runMutation.isError && (
        <p style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>
          {(runMutation.error as Error).message}
        </p>
      )}
      {runMutation.isSuccess && (
        <p style={{ color: "#86efac", fontSize: 13, marginBottom: 8 }}>
          Scan queued ({runMutation.data.scan_run_id}); status updates while{" "}
          <span className="cortex-scan-pulse" style={{ color: "#38bdf8" }}>
            running
          </span>
          .
        </p>
      )}
      {scanNotice && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#0f172a",
            fontSize: 13,
            color: scanNotice.startsWith("Scan failed") ? "#f87171" : "#86efac",
            maxWidth: 720,
          }}
        >
          {scanNotice}
          <button
            type="button"
            onClick={() => setScanNotice(null)}
            style={{
              marginLeft: 12,
              padding: "2px 8px",
              fontSize: 11,
              cursor: "pointer",
              borderRadius: 4,
              border: "1px solid #475569",
              background: "transparent",
              color: "#94a3b8",
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {runningAny && (
        <p style={{ color: "#64748b", fontSize: 12, marginBottom: 16 }}>
          Polling scan status every few seconds…
        </p>
      )}

      {sampleEvidenceMapOpen && (
        <section style={{ marginBottom: 32 }}>
          <ComplianceEvidenceMapBlock
            mapOut={SHASTA_EVIDENCE_MAP_SAMPLE}
            isSample
            marginTop={0}
          />
        </section>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, color: "#94a3b8", marginBottom: 12 }}>Recent scans</h2>
        {scansQuery.isLoading && <p style={{ color: "#64748b" }}>Loading…</p>}
        {scansQuery.isError && (
          <p style={{ color: "#f87171", fontSize: 13 }}>
            {(scansQuery.error as Error).message}
          </p>
        )}
        {scansQuery.data && scansQuery.data.length === 0 && (
          <p style={{ color: "#64748b", fontSize: 13 }}>No scans yet for this organisation.</p>
        )}
        {scansQuery.data && scansQuery.data.length > 0 && (
          <div style={{ overflowX: "auto", border: "1px solid #141e30", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#0f172a", textAlign: "left" }}>
                  <th style={{ padding: 10 }}>Started</th>
                  <th style={{ padding: 10 }}>Cloud</th>
                  <th style={{ padding: 10 }}>Status</th>
                  <th style={{ padding: 10 }}>Findings</th>
                  <th style={{ padding: 10 }}>Engine scan id</th>
                  <th style={{ padding: 10 }}>Run id</th>
                  <th style={{ padding: 10 }}>Actions</th>
                  <th style={{ padding: 10 }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {scansQuery.data.map((row) => {
                  const active =
                    row.status === "running" ||
                    (pinnedScanId !== null && row.id === pinnedScanId);
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderTop: "1px solid #141e30",
                        background: active ? "rgba(56, 189, 248, 0.06)" : undefined,
                      }}
                    >
                      <td style={{ padding: 10, fontFamily: "monospace", color: "#94a3b8" }}>
                        {row.started_at}
                      </td>
                      <td style={{ padding: 10 }}>{row.cloud}</td>
                      <td style={{ padding: 10 }}>
                        {row.status === "running" ? (
                          <span style={{ color: "#38bdf8", fontWeight: 600 }}>
                            <span className="cortex-scan-pulse" aria-hidden>
                              ●
                            </span>{" "}
                            running
                          </span>
                        ) : (
                          row.status
                        )}
                      </td>
                      <td style={{ padding: 10 }}>{row.findings_count}</td>
                      <td
                        style={{
                          padding: 10,
                          maxWidth: 180,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {row.engine_scan_id ?? "—"}
                      </td>
                      <td style={{ padding: 10, fontFamily: "monospace", fontSize: 11 }}>
                        {row.id}
                      </td>
                      <td style={{ padding: 10 }}>
                        <button
                          type="button"
                          onClick={() =>
                            setDetailScanId((cur) => (cur === row.id ? null : row.id))
                          }
                          style={{
                            padding: "4px 10px",
                            fontSize: 11,
                            borderRadius: 6,
                            border: "1px solid #334155",
                            background:
                              detailScanId === row.id ? "#1e293b" : "transparent",
                            color: "#93c5fd",
                            cursor: "pointer",
                          }}
                        >
                          {detailScanId === row.id ? "Hide findings" : "Findings"}
                        </button>
                      </td>
                      <td
                        style={{
                          padding: 10,
                          maxWidth: 220,
                          color: row.error_message ? "#f87171" : "#64748b",
                          fontSize: 11,
                        }}
                        title={row.error_message ?? undefined}
                      >
                        {row.error_message
                          ? row.error_message.length > 80
                            ? `${row.error_message.slice(0, 80)}…`
                            : row.error_message
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detailScanId && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 14, color: "#94a3b8", marginBottom: 12 }}>
            Findings for run{" "}
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>
              {detailScanId}
            </span>
          </h2>
          {detailFindingsQuery.isLoading && <p style={{ color: "#64748b" }}>Loading…</p>}
          {detailFindingsQuery.isError && (
            <p style={{ color: "#f87171", fontSize: 13 }}>
              {(detailFindingsQuery.error as Error).message}
            </p>
          )}
          {detailFindingsQuery.data && detailFindingsQuery.data.length === 0 && (
            <p style={{ color: "#64748b", fontSize: 13 }}>No findings for this run yet.</p>
          )}
          {detailFindingsQuery.data && detailFindingsQuery.data.length > 0 && (
            <div style={{ overflowX: "auto", border: "1px solid #141e30", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#0f172a", textAlign: "left" }}>
                    <th style={{ padding: 10 }}>Severity</th>
                    <th style={{ padding: 10 }}>Title</th>
                    <th style={{ padding: 10 }}>Cloud</th>
                    <th style={{ padding: 10 }}>Region</th>
                    <th style={{ padding: 10 }}>Check</th>
                  </tr>
                </thead>
                <tbody>
                  {detailFindingsQuery.data.map((f) => (
                    <tr key={f.id} style={{ borderTop: "1px solid #141e30" }}>
                      <td style={{ padding: 10 }}>{f.severity_normalized ?? "—"}</td>
                      <td style={{ padding: 10, maxWidth: 280 }}>{f.title ?? "—"}</td>
                      <td style={{ padding: 10 }}>{f.cloud_provider ?? "—"}</td>
                      <td style={{ padding: 10 }}>{f.region ?? "—"}</td>
                      <td style={{ padding: 10, fontFamily: "monospace", fontSize: 11 }}>
                        {f.check_id ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ComplianceEvidenceMapBlock
            mapOut={evidenceMapQuery.data}
            loading={evidenceMapQuery.isLoading}
            error={evidenceMapQuery.isError ? (evidenceMapQuery.error as Error) : null}
          />
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 14, color: "#94a3b8", marginBottom: 12 }}>Latest stored findings</h2>
        {findingsQuery.isLoading && <p style={{ color: "#64748b" }}>Loading…</p>}
        {findingsQuery.isError && (
          <p style={{ color: "#f87171", fontSize: 13 }}>
            {(findingsQuery.error as Error).message}
          </p>
        )}
        {findingsQuery.data && findingsQuery.data.length === 0 && (
          <p style={{ color: "#64748b", fontSize: 13 }}>No cloud findings stored yet.</p>
        )}
        {findingsQuery.data && findingsQuery.data.length > 0 && (
          <div style={{ overflowX: "auto", border: "1px solid #141e30", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#0f172a", textAlign: "left" }}>
                  <th style={{ padding: 10 }}>Severity</th>
                  <th style={{ padding: 10 }}>Title</th>
                  <th style={{ padding: 10 }}>Cloud</th>
                  <th style={{ padding: 10 }}>Region</th>
                  <th style={{ padding: 10 }}>Check</th>
                </tr>
              </thead>
              <tbody>
                {findingsQuery.data.map((f) => (
                  <tr key={f.id} style={{ borderTop: "1px solid #141e30" }}>
                    <td style={{ padding: 10 }}>{f.severity_normalized ?? "—"}</td>
                    <td style={{ padding: 10, maxWidth: 280 }}>{f.title ?? "—"}</td>
                    <td style={{ padding: 10 }}>{f.cloud_provider ?? "—"}</td>
                    <td style={{ padding: 10 }}>{f.region ?? "—"}</td>
                    <td style={{ padding: 10, fontFamily: "monospace", fontSize: 11 }}>
                      {f.check_id ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
