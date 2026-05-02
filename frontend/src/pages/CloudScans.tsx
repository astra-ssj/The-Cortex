import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgContext } from "../hooks/useOrgContext";
import { shastaCloudApi, type ShastaEvidenceMapOut, type ShastaScanRunRow } from "../api/client";
import { ShastaEvidenceMapFlow } from "../components/ShastaEvidenceMapFlow";
import { SHASTA_EVIDENCE_MAP_SAMPLE } from "../lib/shastaEvidenceMapMock";
import { buildEvidenceMapRows } from "../lib/shastaEvidenceMapRows";
import { EngineBadge, TrustChip } from "../components/ui/TrustChip";

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
  const [mapView, setMapView] = useState<"table" | "graph">("table");
  const rows = useMemo(() => (mapOut ? buildEvidenceMapRows(mapOut) : []), [mapOut]);

  useEffect(() => {
    setMapView("table");
  }, [mapOut?.scan_run_id]);

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
      <h3 className="cortex-text-section" style={{ marginBottom: "var(--space-2)" }}>
        Compliance evidence map
      </h3>
      <p
        className="cortex-text-caption"
        style={{ marginBottom: 14, maxWidth: 720, lineHeight: 1.55, color: "var(--dim)" }}
      >
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
            <TrustChip label="Source" variant="source">
              Shasta
              {isSample ? (
                <span style={{ color: "var(--muted)", fontWeight: 400 }}> · demo payload</span>
              ) : null}
            </TrustChip>
            <span>
              Scan: {mapOut.scan_status}
              {mapOut.cloud ? ` · ${mapOut.cloud}` : ""}
            </span>
            <span>
              {mapOut.summary.findings} findings · {mapOut.summary.control_nodes} control nodes ·{" "}
              {mapOut.summary.edges} links
            </span>
          </div>
          {mapOut.summary.edges > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setMapView("table")}
                aria-pressed={mapView === "table"}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-caption)",
                  fontWeight: 600,
                  border: "1px solid var(--border-l)",
                  background: mapView === "table" ? "var(--panel-elevated)" : "transparent",
                  color: mapView === "table" ? "var(--text)" : "var(--dim)",
                  cursor: "pointer",
                }}
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setMapView("graph")}
                aria-pressed={mapView === "graph"}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-caption)",
                  fontWeight: 600,
                  border: "1px solid var(--border-l)",
                  background: mapView === "graph" ? "var(--panel-elevated)" : "transparent",
                  color: mapView === "graph" ? "var(--text)" : "var(--dim)",
                  cursor: "pointer",
                }}
              >
                Graph
              </button>
            </div>
          )}
          {mapOut.summary.edges === 0 && (
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
              No framework control tags on these rows yet — mappings appear when Shasta populates{" "}
              <code style={{ fontSize: 11 }}>framework_controls</code>.
            </p>
          )}
          {mapOut.summary.edges > 0 && mapView === "graph" && (
            <div style={{ marginBottom: 16 }}>
              <ShastaEvidenceMapFlow data={mapOut} />
            </div>
          )}
          {mapView === "table" && rows.length > 0 && (
            <div className="cortex-table-wrap">
              <table className="cortex-table">
                <caption>Findings mapped to framework controls (Shasta engine)</caption>
                <thead>
                  <tr>
                    <th scope="col">Severity</th>
                    <th scope="col">Finding</th>
                    <th scope="col">Mapped controls</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ fn, controls }) => (
                    <tr key={fn.id} style={{ verticalAlign: "top" }}>
                      <td style={{ whiteSpace: "nowrap" }}>{fn.severity ?? "—"}</td>
                      <td style={{ maxWidth: 300 }}>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>{fn.label}</div>
                      </td>
                      <td>
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
          {mapView === "table" && rows.length === 0 && mapOut.summary.findings > 0 && (
            <p style={{ color: "#64748b", fontSize: 13 }}>No rows to display.</p>
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
        color: "var(--text)",
      }}
    >
      <header
        style={{
          marginBottom: "var(--space-6)",
          paddingBottom: "var(--space-4)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h1
          style={{
            margin: 0,
            display: "flex",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: "var(--space-3) var(--space-4)",
          }}
        >
          <span className="cortex-text-page-title">Cloud scans</span>
          <EngineBadge name="Shasta" />
        </h1>
        <p
          className="cortex-text-mono cortex-text-caption"
          style={{
            margin: "var(--space-3) 0 0",
            maxWidth: 560,
            lineHeight: 1.55,
            color: "var(--dim)",
          }}
        >
          Deterministic CSPM via Transilience Shasta; findings persist to Postgres per organisation.
          Store AWS/Azure connector credentials under Integrations first. Use{" "}
          <strong style={{ color: "#94a3b8" }}>Preview sample evidence map</strong> to demo the UI
          without cloud findings.
        </p>
      </header>

      <div
        style={{
          display: "flex",
          gap: "var(--space-3)",
          flexWrap: "wrap",
          marginBottom: "var(--space-6)",
        }}
      >
        <button
          type="button"
          disabled={runMutation.isPending}
          onClick={() => runMutation.mutate("aws")}
          style={{
            padding: "10px 18px",
            borderRadius: "var(--radius-md)",
            border: "1px solid #1e3a5f",
            background: "var(--card)",
            color: "#93c5fd",
            cursor: runMutation.isPending ? "wait" : "pointer",
            fontWeight: 600,
            fontSize: "var(--text-caption)",
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
            borderRadius: "var(--radius-md)",
            border: "1px solid #14532d",
            background: "var(--card)",
            color: "#86efac",
            cursor: runMutation.isPending ? "wait" : "pointer",
            fontWeight: 600,
            fontSize: "var(--text-caption)",
          }}
        >
          Run Azure scan
        </button>
        <button
          type="button"
          onClick={() => setSampleEvidenceMapOpen((v) => !v)}
          aria-expanded={sampleEvidenceMapOpen}
          style={{
            padding: "10px 18px",
            borderRadius: "var(--radius-md)",
            border: "1px solid #854d0e",
            background: sampleEvidenceMapOpen ? "#422006" : "var(--card)",
            color: "#fcd34d",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "var(--text-caption)",
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
            aria-label="Dismiss scan notice"
            style={{
              marginLeft: 12,
              padding: "2px 8px",
              fontSize: "var(--text-micro)",
              cursor: "pointer",
              borderRadius: "var(--radius-sm)",
              border: "1px solid #475569",
              background: "transparent",
              color: "var(--muted)",
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
        <section style={{ marginBottom: "var(--space-8)" }} aria-labelledby="sample-evidence-heading">
          <h2 id="sample-evidence-heading" className="cortex-text-section" style={{ marginBottom: "var(--space-3)" }}>
            Sample evidence map
          </h2>
          <ComplianceEvidenceMapBlock
            mapOut={SHASTA_EVIDENCE_MAP_SAMPLE}
            isSample
            marginTop={0}
          />
        </section>
      )}

      <section style={{ marginBottom: "var(--space-8)" }} aria-labelledby="recent-scans-heading">
        <h2 id="recent-scans-heading" className="cortex-text-section" style={{ marginBottom: "var(--space-3)" }}>
          Recent scans
        </h2>
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
          <div className="cortex-table-wrap">
            <table className="cortex-table">
              <caption>Cloud scan runs stored for this organisation (Shasta)</caption>
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Cloud</th>
                  <th scope="col">Status</th>
                  <th scope="col">Findings</th>
                  <th scope="col">Engine scan id</th>
                  <th scope="col">Run id</th>
                  <th scope="col">Actions</th>
                  <th scope="col">Error</th>
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
                        background: active ? "rgba(56, 189, 248, 0.06)" : undefined,
                      }}
                    >
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                        {row.started_at}
                      </td>
                      <td>{row.cloud}</td>
                      <td>
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
                      <td>{row.findings_count}</td>
                      <td
                        style={{
                          maxWidth: 180,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {row.engine_scan_id ?? "—"}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)" }}>
                        {row.id}
                      </td>
                      <td>
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
                          maxWidth: 220,
                          color: row.error_message ? "#f87171" : "var(--dim)",
                          fontSize: "var(--text-micro)",
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
        <section style={{ marginBottom: "var(--space-8)" }} aria-labelledby="detail-findings-heading">
          <h2 id="detail-findings-heading" className="cortex-text-section" style={{ marginBottom: "var(--space-3)" }}>
            Findings for run{" "}
            <span className="cortex-text-mono" style={{ color: "var(--dim)", fontWeight: 400 }}>
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
            <div className="cortex-table-wrap">
              <table className="cortex-table">
                <caption>Findings persisted for the selected scan run</caption>
                <thead>
                  <tr>
                    <th scope="col">Severity</th>
                    <th scope="col">Title</th>
                    <th scope="col">Cloud</th>
                    <th scope="col">Region</th>
                    <th scope="col">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {detailFindingsQuery.data.map((f) => (
                    <tr key={f.id}>
                      <td>{f.severity_normalized ?? "—"}</td>
                      <td style={{ maxWidth: 280 }}>{f.title ?? "—"}</td>
                      <td>{f.cloud_provider ?? "—"}</td>
                      <td>{f.region ?? "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)" }}>
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

      <section aria-labelledby="latest-findings-heading">
        <h2 id="latest-findings-heading" className="cortex-text-section" style={{ marginBottom: "var(--space-3)" }}>
          Latest stored findings
        </h2>
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
          <div className="cortex-table-wrap">
            <table className="cortex-table">
              <caption>Most recently stored findings across scans</caption>
              <thead>
                <tr>
                  <th scope="col">Severity</th>
                  <th scope="col">Title</th>
                  <th scope="col">Cloud</th>
                  <th scope="col">Region</th>
                  <th scope="col">Check</th>
                </tr>
              </thead>
              <tbody>
                {findingsQuery.data.map((f) => (
                  <tr key={f.id}>
                    <td>{f.severity_normalized ?? "—"}</td>
                    <td style={{ maxWidth: 280 }}>{f.title ?? "—"}</td>
                    <td>{f.cloud_provider ?? "—"}</td>
                    <td>{f.region ?? "—"}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-micro)" }}>
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
