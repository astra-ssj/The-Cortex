/**
 * Evidence Vault — the real append-only audit_log chain from GET /api/v1/audit.
 *
 * This component used to hash a hardcoded RAW_SEED array. The SHA-256 was genuine
 * but the subject was invented, so "INTEGRITY VERIFIED" meant only that a constant
 * still equalled itself. Rows now come from `append_audit_log`, which has been
 * writing a prev_hash chain since migration 016, and verification runs over the
 * learner's own decision trail.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  type AuditEntry,
  type ChainVerification,
  getAuditChain,
  sha256Hex,
  verifyChain,
} from "../api/audit";

/** Coarse grouping for the timeline badge. Actions are dotted, e.g. `learning.session.decide.complete`. */
type EventKind = "LEARNING" | "GRADING" | "FINDING" | "ASSESSMENT" | "AUTH" | "SYSTEM";

function eventKind(action: string): EventKind {
  if (action.startsWith("learning.")) {
    return action.includes("decide") ? "GRADING" : "LEARNING";
  }
  if (action.startsWith("finding")) return "FINDING";
  if (action.startsWith("assessment")) return "ASSESSMENT";
  if (action.startsWith("auth") || action.startsWith("user")) return "AUTH";
  return "SYSTEM";
}

function kindBadgeStyle(kind: EventKind): { bg: string; color: string } {
  switch (kind) {
    case "GRADING":
      return { bg: "color-mix(in srgb, var(--green) 20%, transparent)", color: "var(--green)" };
    case "LEARNING":
      return { bg: "color-mix(in srgb, var(--blue) 20%, transparent)", color: "var(--cyan)" };
    case "FINDING":
      return { bg: "color-mix(in srgb, var(--red) 20%, transparent)", color: "var(--red)" };
    case "ASSESSMENT":
      return { bg: "color-mix(in srgb, var(--amber) 15%, transparent)", color: "var(--amber)" };
    case "AUTH":
    case "SYSTEM":
    default:
      return { bg: "color-mix(in srgb, var(--blue) 15%, transparent)", color: "var(--blue)" };
  }
}

/** `learning.session.decide.complete` → `Session decide complete`. */
function humaniseAction(action: string): string {
  const parts = action.split(".").filter(Boolean);
  const tail = parts.length > 1 ? parts.slice(1) : parts;
  const words = tail.join(" ").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function truncateHash(h: string): string {
  return h.length > 32 ? `${h.slice(0, 32)}…` : h;
}

function formatShortTime(ts: string): string {
  const d = new Date(ts);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * One line of plain English about what an entry recorded.
 *
 * The payload shape varies by action, so this reads the few keys the learning loop
 * and findings writers actually set and otherwise says nothing rather than guessing.
 */
function summarise(entry: AuditEntry): string | null {
  const p = entry.payload ?? {};
  const parts: string[] = [];
  const push = (label: string, value: unknown) => {
    if (typeof value === "string" && value) parts.push(`${label}: ${value}`);
    else if (typeof value === "number") parts.push(`${label}: ${value}`);
  };
  push("Scenario", p["scenario_slug"]);
  push("Stage", p["stage"]);
  push("Choice", p["choice"]);
  if (typeof p["confidence"] === "number") {
    parts.push(`Confidence: ${(p["confidence"] as number).toFixed(2)}`);
  }
  const after = p["after"];
  if (after && typeof after === "object" && "status" in (after as object)) {
    push("Status", (after as Record<string, unknown>)["status"]);
  }
  return parts.length ? parts.join(" · ") : null;
}

const panelStyle = {
  padding: 20,
  background: "var(--surface)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 12,
} as const;

export function EvidenceVault() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [computeState, setComputeState] = useState<"idle" | "computing" | "done">("idle");
  const [computedHash, setComputedHash] = useState<string | null>(null);
  const [verifyProgress, setVerifyProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [chainVerifyResult, setChainVerifyResult] = useState<ChainVerification | null>(null);

  const chainQuery = useQuery({
    queryKey: ["audit-chain"],
    queryFn: () => getAuditChain({ limit: 200 }),
  });

  const entries = chainQuery.data?.items ?? [];

  // Any refetch invalidates a previous verdict: it may not describe these rows.
  useEffect(() => {
    setChainVerifyResult(null);
    setComputeState("idle");
    setComputedHash(null);
  }, [chainQuery.dataUpdatedAt]);

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const gradedCount = useMemo(
    () => entries.filter((e) => eventKind(e.action) === "GRADING").length,
    [entries],
  );

  const handleComputeHash = useCallback(async () => {
    if (!selected) return;
    setComputeState("computing");
    setComputedHash(null);
    setComputedHash(await sha256Hex(selected.hash_material));
    setComputeState("done");
  }, [selected]);

  const handleVerifyFullChain = useCallback(async () => {
    setChainVerifyResult(null);
    const yieldFrame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const result = await verifyChain(entries, async (current, total) => {
      setVerifyProgress({ current, total });
      await yieldFrame();
    });
    setVerifyProgress(null);
    setChainVerifyResult(result);
  }, [entries]);

  const downloadPack = useCallback(() => {
    const payload = {
      exported_at: new Date().toISOString(),
      // The preimage travels with the export so the pack is verifiable offline by
      // an auditor who never talks to this API.
      records: entries.map((e) => ({
        id: e.id,
        action: e.action,
        actor: e.actor,
        resource_type: e.resource_type,
        resource_id: e.resource_id,
        payload: e.payload,
        timestamp: e.created_at,
        prev_hash: e.prev_hash,
        hash: e.hash,
        hash_material: e.hash_material,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence-vault-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  const head = entries[0];
  const chainIntact = chainVerifyResult ? chainVerifyResult.ok : chainQuery.data?.chain_verified;

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
      <section style={{ flex: "1 1 60%", minWidth: 320 }}>
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
        <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 8, maxWidth: 560, lineHeight: 1.5 }}>
          Every graded decision, gap and approval is written to the append-only audit log,
          SHA-256 hashed and chain-linked to the entry before it. Verification below runs in
          your browser over the rows this API returned.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16, marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text)" }}>{entries.length}</strong> Records
          </span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--green)" }}>{gradedCount}</strong> Graded decisions
          </span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span
            style={{ fontSize: 13, color: chainIntact === false ? "var(--red)" : "var(--green)" }}
          >
            Chain Intact {chainIntact === false ? "✗" : "✓"}
          </span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Last: {chainQuery.isLoading ? "…" : head ? formatShortTime(head.created_at) : "—"}
          </span>
        </div>

        {chainQuery.isLoading ? (
          <p style={{ color: "var(--dim)" }}>Loading audit chain…</p>
        ) : chainQuery.isError ? (
          <p style={{ color: "var(--red)", fontSize: 13 }}>
            Could not load the audit chain. {(chainQuery.error as Error)?.message ?? ""}
          </p>
        ) : entries.length === 0 ? (
          <div style={{ ...panelStyle, maxWidth: 520 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              No evidence yet
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.6 }}>
              The vault holds what you actually did, not a sample. Complete a scenario in the
              Learning Loop and your graded decisions will appear here, hash-chained, within the
              same request that scored them.
            </p>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            {entries.map((entry, idx) => {
              const kind = eventKind(entry.action);
              const badge = kindBadgeStyle(kind);
              const hasNext = idx < entries.length - 1;
              const summary = summarise(entry);
              return (
                <div
                  key={entry.id}
                  style={{ position: "relative", paddingLeft: 24, paddingBottom: hasNext ? 28 : 0 }}
                >
                  {hasNext && (
                    <div
                      style={{
                        position: "absolute",
                        left: 7,
                        top: 24,
                        bottom: 0,
                        width: 2,
                        background:
                          "linear-gradient(180deg, color-mix(in srgb, var(--cyan) 27%, transparent), var(--border))",
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
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
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
                        [{kind}]
                      </span>
                      <span style={{ fontSize: 11, color: "var(--dim)", marginLeft: "auto" }}>
                        {new Date(entry.created_at).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <h3
                      style={{
                        margin: "10px 0 6px",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--text)",
                      }}
                    >
                      {humaniseAction(entry.action)}
                    </h3>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        marginBottom: 8,
                      }}
                    >
                      {entry.action}
                    </div>
                    {summary && (
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                        {summary}
                      </div>
                    )}
                    {entry.resource_type && (
                      <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 12 }}>
                        {entry.resource_type}
                        {entry.resource_id ? ` · ${entry.resource_id}` : ""}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
                      SHA-256:
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--cyan)",
                        wordBreak: "break-all",
                      }}
                    >
                      {truncateHash(entry.hash)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        marginTop: 10,
                        marginBottom: 4,
                      }}
                    >
                      Previous hash:
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        wordBreak: "break-all",
                      }}
                    >
                      {truncateHash(entry.prev_hash)}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 14,
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        Signed by: {entry.actor}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(entry.id);
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

      <aside style={{ ...panelStyle, flex: "1 1 300px", maxWidth: 400, position: "sticky", top: 24 }}>
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
          Select any record and recompute its hash here, in this tab.
        </p>

        <label
          style={{ display: "block", marginTop: 16, fontSize: 11, color: "var(--text-tertiary)" }}
          htmlFor="ev-record-select"
        >
          Select record to verify
        </label>
        <select
          id="ev-record-select"
          value={selectedId ?? ""}
          onChange={(e) => {
            setSelectedId(e.target.value || null);
            setComputeState("idle");
            setComputedHash(null);
          }}
          disabled={entries.length === 0}
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
          {entries.map((e) => (
            <option key={e.id} value={e.id}>
              {humaniseAction(e.action)} · {new Date(e.created_at).toLocaleTimeString("en-GB")}
            </option>
          ))}
        </select>

        {selected && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              background: "var(--bg)",
              borderRadius: 8,
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              <div>
                <strong style={{ color: "var(--text)" }}>{eventKind(selected.action)}</strong>
              </div>
              <div style={{ marginTop: 8 }}>{humaniseAction(selected.action)}</div>
              <div style={{ marginTop: 8, color: "var(--dim)" }}>{selected.actor}</div>
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
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--blue) 80%, black), var(--blue))",
                color: "var(--bg)",
                fontWeight: 600,
                cursor: computeState === "computing" ? "wait" : "pointer",
              }}
            >
              {computeState === "computing" ? "Computing SHA-256…" : "Compute Hash"}
            </button>
            {computeState === "done" && computedHash && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
                  Computed:
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--cyan)",
                    wordBreak: "break-all",
                  }}
                >
                  {computedHash}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    marginTop: 10,
                    marginBottom: 4,
                  }}
                >
                  Stored:
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-secondary)",
                    wordBreak: "break-all",
                  }}
                >
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
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        marginTop: 10,
                        lineHeight: 1.5,
                      }}
                    >
                      Hash matches the value stored when this action was taken. The record has not
                      been altered since.
                    </p>
                  </div>
                ) : (
                  <p style={{ color: "var(--red)", fontSize: 12, marginTop: 10 }}>
                    Hash mismatch — this record does not match what was written.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>CHAIN INTEGRITY</div>
          <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 6 }}>
            Recomputes every hash and checks every prev_hash link
          </p>
          <button
            type="button"
            onClick={handleVerifyFullChain}
            disabled={!entries.length || verifyProgress !== null}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "10px",
              borderRadius: 8,
              border: "1px solid var(--cyan)",
              background: "transparent",
              color: "var(--cyan)",
              fontWeight: 600,
              cursor: !entries.length || verifyProgress !== null ? "not-allowed" : "pointer",
              opacity: !entries.length ? 0.5 : 1,
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
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      marginTop: 10,
                      lineHeight: 1.5,
                    }}
                  >
                    All {chainVerifyResult.checked} records verified. No tampering detected.
                  </p>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
                    Head hash:
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--cyan)",
                      wordBreak: "break-all",
                    }}
                  >
                    {chainVerifyResult.headHash}
                  </div>
                </>
              ) : (
                <p style={{ color: "var(--red)", fontSize: 12, lineHeight: 1.5 }}>
                  {chainVerifyResult.hashMismatchAt
                    ? `Record ${chainVerifyResult.hashMismatchAt} does not match its own hash.`
                    : `Chain link broken at record ${chainVerifyResult.brokenLinkAt} — an entry was removed or reordered.`}
                </p>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>EXPORT</div>
          <p style={{ fontSize: 12, color: "var(--dim)", marginTop: 6 }}>
            Includes each record's hash preimage, so an auditor can verify the pack offline.
          </p>
          <button
            type="button"
            onClick={downloadPack}
            disabled={!entries.length}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "10px",
              borderRadius: 8,
              border: "none",
              background: "var(--border)",
              color: "var(--text)",
              fontWeight: 600,
              cursor: entries.length ? "pointer" : "not-allowed",
            }}
          >
            Download Evidence Pack
          </button>
        </div>

        <p style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.5, marginTop: 24 }}>
          Records are append-only at the database layer (UPDATE and DELETE are rejected by
          trigger) and chain-linked by SHA-256. Suitable for NIS2 Art.20 management liability
          defence and GDPR Art.5(2) accountability documentation.
        </p>
      </aside>
    </div>
  );
}

export default EvidenceVault;
