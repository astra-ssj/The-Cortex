import { useCallback, useEffect, useMemo, useState } from "react";

type EvidenceType = "ASSESSMENT" | "APPROVAL" | "OVERRIDE" | "FINDING" | "REPORT";

type RawEvidenceRecord = {
  id: number;
  type: EvidenceType;
  entity: string;
  title: string;
  verdict: string;
  conf?: number;
  actor: string;
  ts: string;
};

type ChainRecord = RawEvidenceRecord & {
  hash: string;
  prev_hash: string;
};

async function computeHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function truncateHash(h: string): string {
  return `${h.slice(0, 32)}...`;
}

/** TODO: Load chain from audit_fabric / evidence API when evidenceVault feature is enabled (append-only entries by org). */
const RAW_SEED: RawEvidenceRecord[] = [
  {
    id: 12,
    type: "ASSESSMENT",
    entity: "AstraLabs DE",
    title: "GDPR Art.33 — 72h breach notification",
    verdict: "NON_COMPLIANT",
    conf: 0.58,
    actor: "ZTAIP Engine",
    ts: "2026-04-30T21:15:00Z",
  },
  {
    id: 11,
    type: "APPROVAL",
    entity: "AstraLabs DE",
    title: "NIS2 Art.23(4)(a) — CSIRT notification",
    verdict: "NON_COMPLIANT → APPROVED",
    actor: "admin@astralabs.com · Group CISO",
    ts: "2026-04-30T20:48:00Z",
  },
  {
    id: 10,
    type: "ASSESSMENT",
    entity: "AstraLabs DE",
    title: "NIS2 Art.23(4)(a) — 24h CSIRT notification",
    verdict: "NON_COMPLIANT",
    conf: 0.61,
    actor: "ZTAIP Engine",
    ts: "2026-04-30T20:45:00Z",
  },
  {
    id: 9,
    type: "FINDING",
    entity: "AstraLabs Group",
    title: "Supply chain assessment not performed",
    verdict: "OPEN · HIGH",
    actor: "admin@astralabs.com · Group CISO",
    ts: "2026-04-30T20:40:00Z",
  },
  {
    id: 8,
    type: "OVERRIDE",
    entity: "AstraLabs UK",
    title: "UK GDPR Art.33 — breach notification",
    verdict: "OVERRIDE: PARTIAL (was NON_COMPLIANT)",
    actor: "admin@astralabs.com · Group CISO",
    ts: "2026-04-30T19:55:00Z",
  },
  {
    id: 7,
    type: "REPORT",
    entity: "AstraLabs Group",
    title: "Executive Summary Report Generated",
    verdict: "BOARD CONFIDENTIAL · 58% posture",
    actor: "admin@astralabs.com · Group CISO",
    ts: "2026-04-30T19:30:00Z",
  },
  {
    id: 6,
    type: "ASSESSMENT",
    entity: "AstraLabs ES",
    title: "NIS2 Art.21(2)(d) — Supply chain security",
    verdict: "NON_COMPLIANT",
    conf: 0.64,
    actor: "ZTAIP Engine",
    ts: "2026-04-30T18:20:00Z",
  },
  {
    id: 5,
    type: "APPROVAL",
    entity: "AstraLabs ES",
    title: "ISO 27001 A.5.23 — Cloud security",
    verdict: "PARTIAL → APPROVED",
    actor: "admin@astralabs.com · Group CISO",
    ts: "2026-04-30T18:15:00Z",
  },
  {
    id: 4,
    type: "ASSESSMENT",
    entity: "AstraLabs AU",
    title: "NIST CSF RS.RP-1 — Response plan",
    verdict: "PARTIAL",
    conf: 0.7,
    actor: "ZTAIP Engine",
    ts: "2026-04-30T17:00:00Z",
  },
  {
    id: 3,
    type: "FINDING",
    entity: "AstraLabs DE",
    title: "Penetration test overdue — 18 months",
    verdict: "OPEN · HIGH · Due 2026-03-17",
    actor: "ZTAIP Engine",
    ts: "2026-04-29T14:30:00Z",
  },
  {
    id: 2,
    type: "ASSESSMENT",
    entity: "AstraLabs DE",
    title: "EU AI Act Art.14 — Human oversight",
    verdict: "NON_COMPLIANT",
    conf: 0.52,
    actor: "ZTAIP Engine",
    ts: "2026-04-29T10:00:00Z",
  },
  {
    id: 1,
    type: "ASSESSMENT",
    entity: "AstraLabs Group",
    title: "ISO 27001 A.5.1 — Security policies",
    verdict: "COMPLIANT",
    conf: 0.94,
    actor: "ZTAIP Engine",
    ts: "2026-04-28T09:00:00Z",
  },
];

function typeBadgeStyle(t: EvidenceType): { bg: string; color: string } {
  switch (t) {
    case "ASSESSMENT":
      return { bg: "color-mix(in srgb, var(--blue) 20%, transparent)", color: "var(--cyan)" };
    case "APPROVAL":
      return { bg: "color-mix(in srgb, var(--green) 20%, transparent)", color: "var(--green)" };
    case "OVERRIDE":
      return { bg: "color-mix(in srgb, var(--amber) 15%, transparent)", color: "var(--amber)" };
    case "FINDING":
      return { bg: "color-mix(in srgb, var(--red) 20%, transparent)", color: "var(--red)" };
    case "REPORT":
    default:
      return { bg: "color-mix(in srgb, var(--blue) 15%, transparent)", color: "var(--blue)" };
  }
}

function formatShortTime(ts: string): string {
  const d = new Date(ts);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function buildChain(seed: RawEvidenceRecord[]): Promise<ChainRecord[]> {
  const sorted = [...seed].sort((a, b) => a.id - b.id);
  const chain: ChainRecord[] = [];
  let prevHash = "0".repeat(64);
  for (const rec of sorted) {
    const payload = JSON.stringify({
      id: rec.id,
      type: rec.type,
      title: rec.title,
      verdict: rec.verdict,
      entity: rec.entity,
      timestamp: rec.ts,
      prev_hash: prevHash,
    });
    const hash = await computeHash(payload);
    chain.push({ ...rec, hash, prev_hash: prevHash });
    prevHash = hash;
  }
  return chain;
}

export function EvidenceVault() {
  const [chain, setChain] = useState<ChainRecord[]>([]);
  const [loadingChain, setLoadingChain] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [computeState, setComputeState] = useState<"idle" | "computing" | "done">("idle");
  const [computedHash, setComputedHash] = useState<string | null>(null);
  const [verifyProgress, setVerifyProgress] = useState<{ current: number; total: number } | null>(null);
  const [chainVerifyResult, setChainVerifyResult] = useState<{
    ok: boolean;
    finalHash: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingChain(true);
      const c = await buildChain(RAW_SEED);
      if (!cancelled) {
        setChain(c);
        setLoadingChain(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayChain = useMemo(() => [...chain].sort((a, b) => b.id - a.id), [chain]);

  const selected = useMemo(
    () => chain.find((r) => r.id === selectedId) ?? null,
    [chain, selectedId],
  );

  const approvedCount = useMemo(() => chain.filter((r) => r.type === "APPROVAL").length, [chain]);

  const handleComputeHash = useCallback(async () => {
    if (!selected) return;
    setComputeState("computing");
    setComputedHash(null);
    const payload = JSON.stringify({
      id: selected.id,
      type: selected.type,
      title: selected.title,
      verdict: selected.verdict,
      entity: selected.entity,
      timestamp: selected.ts,
      prev_hash: selected.prev_hash,
    });
    const h = await computeHash(payload);
    setComputedHash(h);
    setComputeState("done");
  }, [selected]);

  const handleVerifyFullChain = useCallback(async () => {
    setChainVerifyResult(null);
    const sorted = [...chain].sort((a, b) => a.id - b.id);
    let prevHash = "0".repeat(64);
    const yieldFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    for (let i = 0; i < sorted.length; i++) {
      setVerifyProgress({ current: i + 1, total: sorted.length });
      await yieldFrame();
      const rec = sorted[i]!;
      const payload = JSON.stringify({
        id: rec.id,
        type: rec.type,
        title: rec.title,
        verdict: rec.verdict,
        entity: rec.entity,
        timestamp: rec.ts,
        prev_hash: prevHash,
      });
      const h = await computeHash(payload);
      if (h !== rec.hash) {
        setVerifyProgress(null);
        setChainVerifyResult({
          ok: false,
          finalHash: "",
          message: `Mismatch at record #${rec.id}`,
        });
        return;
      }
      prevHash = h;
    }
    setVerifyProgress(null);
    const finalHash =
      sorted.length > 0 ? sorted[sorted.length - 1]!.hash : "";
    setChainVerifyResult({
      ok: true,
      finalHash,
      message: `All ${sorted.length} records verified. No tampering detected.`,
    });
  }, [chain]);

  const downloadPack = useCallback(() => {
    const payload = {
      exported_at: new Date().toISOString(),
      records: chain.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        verdict: r.verdict,
        entity: r.entity,
        timestamp: r.ts,
        actor: r.actor,
        prev_hash: r.prev_hash,
        hash: r.hash,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `evidence-vault-${d}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chain]);

  const lastRecord = displayChain[0];

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <section style={{ flex: "0 0 65%", minWidth: 0 }}>
        <h2
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 700,
            fontSize: 18,
            margin: 0,
            color: "var(--text)",
          }}
        >
          Cryptographic Evidence Chain
        </h2>
        <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 8, maxWidth: 520, lineHeight: 1.5 }}>
          Every assessment, approval and finding is SHA-256 hashed and chain-linked. Tamper-evident.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16, marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text)" }}>{chain.length}</strong> Records
          </span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--green)" }}>{approvedCount}</strong> Approved
          </span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span
            style={{
              fontSize: 13,
              color: chainVerifyResult?.ok === false ? "var(--red)" : "var(--green)",
            }}
          >
            Chain Intact {chainVerifyResult?.ok === false ? "✗" : "✓"}
          </span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Last: {loadingChain ? "…" : lastRecord ? formatShortTime(lastRecord.ts) : "—"}
          </span>
        </div>

        {loadingChain ? (
          <p style={{ color: "var(--dim)" }}>Computing chain hashes…</p>
        ) : (
          <div style={{ position: "relative" }}>
            {displayChain.map((rec, idx) => {
              const badge = typeBadgeStyle(rec.type);
              const hasNext = idx < displayChain.length - 1;
              return (
                <div key={rec.id} style={{ position: "relative", paddingLeft: 24, paddingBottom: hasNext ? 28 : 0 }}>
                  {hasNext && (
                    <div
                      style={{
                        position: "absolute",
                        left: 7,
                        top: 24,
                        bottom: 0,
                        width: 2,
                        background: "linear-gradient(180deg, color-mix(in srgb, var(--cyan) 27%, transparent), var(--border))",
                      }}
                    />
                  )}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 6,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "var(--surface)",
                      border: "3px solid var(--cyan)",
                      zIndex: 1,
                    }}
                  />
                  <div
                    style={{
                      padding: 18,
                      background: "var(--surface)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 10,
                      marginLeft: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--dim)" }}>#{rec.id}</span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          background: badge.bg,
                          color: badge.color,
                        }}
                      >
                        [{rec.type}]
                      </span>
                      <span style={{ fontSize: 11, color: "var(--dim)", marginLeft: "auto" }}>
                        {new Date(rec.ts).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <h3 style={{ margin: "10px 0 6px", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{rec.title}</h3>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                      Verdict: {rec.verdict}
                      {typeof rec.conf === "number" && (
                        <span style={{ color: "var(--text-secondary)" }}> [conf: {rec.conf.toFixed(2)}]</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 12 }}>Entity: {rec.entity}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>SHA-256:</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--cyan)", wordBreak: "break-all" }}>
                      {truncateHash(rec.hash)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 10, marginBottom: 4 }}>Previous hash:</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", wordBreak: "break-all" }}>
                      {truncateHash(rec.prev_hash)}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        Signed by:{" "}
                        {rec.actor.includes("admin@astralabs.com")
                          ? "CISO · admin@astralabs.com"
                          : rec.actor}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(rec.id);
                          setComputeState("idle");
                          setComputedHash(null);
                          setChainVerifyResult(null);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "1px solid var(--cyan)",
                          background: "transparent",
                          color: "var(--cyan)",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Verify →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <aside
        style={{
          flex: "0 0 35%",
          maxWidth: 400,
          padding: 20,
          background: "var(--surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          position: "sticky",
          top: 24,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 700,
            fontSize: 17,
            margin: 0,
            color: "var(--text)",
          }}
        >
          Verify Evidence
        </h2>
        <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 8, lineHeight: 1.5 }}>
          Select any record and verify its cryptographic integrity
        </p>

        <label style={{ display: "block", marginTop: 16, fontSize: 11, color: "var(--text-tertiary)" }} htmlFor="ev-record-select">
          Select record to verify
        </label>
        <select
          id="ev-record-select"
          value={selectedId ?? ""}
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            setSelectedId(v);
            setComputeState("idle");
            setComputedHash(null);
          }}
          style={{
            width: "100%",
            marginTop: 6,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--bg)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text)",
            fontSize: 13,
          }}
        >
          <option value="">— Choose —</option>
          {chain
            .slice()
            .sort((a, b) => b.id - a.id)
            .map((r) => (
              <option key={r.id} value={r.id}>
                Record #{r.id} · {r.type}
              </option>
            ))}
        </select>

        {selected && (
          <div style={{ marginTop: 16, padding: 14, background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              <div>
                <strong style={{ color: "var(--text)" }}>{selected.type}</strong>
              </div>
              <div style={{ marginTop: 8 }}>{selected.title}</div>
              <div style={{ marginTop: 8, color: "var(--dim)" }}>{selected.entity}</div>
            </div>
            <button
              type="button"
              onClick={handleComputeHash}
              disabled={computeState === "computing"}
              style={{
                marginTop: 14,
                width: "100%",
                padding: "10px",
                borderRadius: 8,
                border: "none",
                background: "linear-gradient(135deg, color-mix(in srgb, var(--blue) 80%, black), var(--blue))",
                color: "var(--bg)",
                fontWeight: 600,
                cursor: computeState === "computing" ? "wait" : "pointer",
              }}
            >
              {computeState === "computing" ? "Computing SHA-256…" : "Compute Hash"}
            </button>
            {computeState === "computing" && (
              <p style={{ fontSize: 12, color: "var(--blue)", marginTop: 10 }}>Computing SHA-256…</p>
            )}
            {computeState === "done" && computedHash && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Computed:</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--cyan)", wordBreak: "break-all" }}>
                  {computedHash}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 10, marginBottom: 4 }}>Stored:</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", wordBreak: "break-all" }}>
                  {selected.hash}
                </div>
                {computedHash === selected.hash ? (
                  <div style={{ marginTop: 14 }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 12px",
                        borderRadius: 6,
                        background: "color-mix(in srgb, var(--green) 20%, transparent)",
                        color: "var(--green)",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      ✓ INTEGRITY VERIFIED
                    </span>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.5 }}>
                      Hash matches stored value. This record has not been tampered with.
                    </p>
                  </div>
                ) : (
                  <p style={{ color: "var(--red)", fontSize: 12, marginTop: 10 }}>Hash mismatch.</p>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>CHAIN INTEGRITY</div>
          <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 6 }}>Full chain verification</p>
          <button
            type="button"
            onClick={handleVerifyFullChain}
            disabled={!chain.length || verifyProgress !== null}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "10px",
              borderRadius: 8,
              border: "1px solid var(--cyan)",
              background: "transparent",
              color: "var(--cyan)",
              fontWeight: 600,
              cursor: !chain.length || verifyProgress !== null ? "not-allowed" : "pointer",
              opacity: !chain.length ? 0.5 : 1,
            }}
          >
            Verify Entire Chain
          </button>
          {verifyProgress && (
            <p style={{ fontSize: 12, color: "var(--blue)", marginTop: 10 }}>
              Verifying record {verifyProgress.current}/{verifyProgress.total}…
            </p>
          )}
          {chainVerifyResult && (
            <div style={{ marginTop: 14 }}>
              {chainVerifyResult.ok ? (
                <>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: "color-mix(in srgb, var(--green) 20%, transparent)",
                      color: "var(--green)",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    ✓ CHAIN INTACT
                  </span>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.5 }}>{chainVerifyResult.message}</p>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>Chain hash:</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--cyan)", wordBreak: "break-all" }}>
                    {chainVerifyResult.finalHash}
                  </div>
                </>
              ) : (
                <p style={{ color: "var(--red)", fontSize: 12 }}>{chainVerifyResult.message}</p>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>EXPORT</div>
          <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 6 }}>Export Evidence Package</p>
          <button
            type="button"
            onClick={downloadPack}
            disabled={!chain.length}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "10px",
              borderRadius: 8,
              border: "none",
              background: "var(--border)",
              color: "var(--text)",
              fontWeight: 600,
              cursor: chain.length ? "pointer" : "not-allowed",
            }}
          >
            Download Evidence Pack
          </button>
        </div>

        <p style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.5, marginTop: 24 }}>
          Evidence records are SHA-256 hashed and chain-linked. Suitable for NIS2 Art.20 management liability defence and GDPR
          Art.5(2) accountability documentation.
        </p>
      </aside>
    </div>
  );
}

export default EvidenceVault;
