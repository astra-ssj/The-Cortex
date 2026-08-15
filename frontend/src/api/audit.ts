/**
 * Read side of the append-only audit_log hash chain (GET /api/v1/audit).
 *
 * Backs the Evidence Vault. Before this the vault hashed a hardcoded array, which
 * verified nothing; these rows are written by `append_audit_log` on every
 * consequential action and chained with a real prev_hash.
 */

import { fetchApi } from "./client";

export interface AuditEntry {
  id: string;
  org_id: string | null;
  actor: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  payload: Record<string, unknown>;
  hash: string;
  prev_hash: string;
  created_at: string;
  /**
   * The exact preimage the server hashed, rebuilt from the stored columns:
   * `action|resource_type|resource_id|payload_json|prev_hash`.
   *
   * Sent rather than reassembled here on purpose. `payload_json` is Python's
   * `json.dumps(..., sort_keys=True)`; a JavaScript reimplementation would diverge
   * on separators and non-ASCII escaping and call untampered rows tampered.
   */
  hash_material: string;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  offset: number;
  limit: number;
  genesis_hash: string;
  /** The server's own walk of this window. The UI repeats it independently. */
  chain_verified: boolean;
}

export interface ListAuditParams {
  action_prefix?: string;
  resource_id?: string;
  org_id?: string;
  offset?: number;
  limit?: number;
}

export async function getAuditChain(params?: ListAuditParams): Promise<AuditPage> {
  const search = new URLSearchParams();
  if (params?.action_prefix) search.set("action_prefix", params.action_prefix);
  if (params?.resource_id) search.set("resource_id", params.resource_id);
  if (params?.org_id) search.set("org_id", params.org_id);
  if (params?.offset != null) search.set("offset", String(params.offset));
  if (params?.limit != null) search.set("limit", String(params.limit));
  const qs = search.toString();
  return fetchApi<AuditPage>(`/api/v1/audit${qs ? `?${qs}` : ""}`);
}

/** SHA-256 via WebCrypto, hex-encoded to match Postgres/Python output. */
export async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  /** Set when a row's own hash does not match its preimage. */
  hashMismatchAt?: string;
  /** Set when a row's prev_hash does not match the row before it. */
  brokenLinkAt?: string;
  headHash: string;
}

/**
 * Verify a window of the chain entirely in the browser.
 *
 * Two independent checks. Recomputing each hash catches an edited row; comparing
 * prev_hash against the previous row's hash catches a removed or reordered one,
 * which a per-row hash check alone would miss.
 *
 * `entries` arrive newest-first, so the walk runs in reverse. `onProgress` lets the
 * caller yield a frame between rows so a long chain does not freeze the tab.
 */
export async function verifyChain(
  entries: AuditEntry[],
  onProgress?: (current: number, total: number) => Promise<void> | void,
): Promise<ChainVerification> {
  const oldestFirst = [...entries].reverse();
  for (let i = 0; i < oldestFirst.length; i++) {
    const entry = oldestFirst[i]!;
    await onProgress?.(i + 1, oldestFirst.length);
    const recomputed = await sha256Hex(entry.hash_material);
    if (recomputed !== entry.hash) {
      return {
        ok: false,
        checked: i,
        hashMismatchAt: entry.id,
        headHash: "",
      };
    }
    const previous = oldestFirst[i - 1];
    if (previous && entry.prev_hash !== previous.hash) {
      return {
        ok: false,
        checked: i,
        brokenLinkAt: entry.id,
        headHash: "",
      };
    }
  }
  return {
    ok: true,
    checked: oldestFirst.length,
    headHash: entries[0]?.hash ?? "",
  };
}
