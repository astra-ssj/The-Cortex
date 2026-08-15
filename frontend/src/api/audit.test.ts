/**
 * Browser-side chain verification.
 *
 * The Evidence Vault's whole claim rests on these two checks catching tampering, so
 * the failure paths matter more than the happy one: a verifier that always says
 * "intact" is worse than no verifier, because users stop looking.
 */

import { describe, expect, it } from "vitest";

import { type AuditEntry, sha256Hex, verifyChain } from "./audit";

const GENESIS = "0".repeat(64);

/** Build a valid chain the way the server does: hash the preimage, link prev_hash. */
async function buildChain(actions: string[]): Promise<AuditEntry[]> {
  const oldestFirst: AuditEntry[] = [];
  let prev = GENESIS;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    const material = [action, "session", `res-${i}`, "{}", prev === GENESIS ? "" : prev].join("|");
    const hash = await sha256Hex(material);
    oldestFirst.push({
      id: `entry-${i}`,
      org_id: "org-1",
      actor: "learner@example.com",
      action,
      resource_type: "session",
      resource_id: `res-${i}`,
      payload: {},
      hash,
      prev_hash: prev,
      created_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
      hash_material: material,
    });
    prev = hash;
  }
  // The API returns newest-first; verifyChain must handle that ordering.
  return oldestFirst.reverse();
}

describe("verifyChain", () => {
  it("accepts an untampered chain and reports the head hash", async () => {
    const entries = await buildChain([
      "learning.session.start",
      "learning.session.decide.complete",
      "finding.update",
    ]);

    const result = await verifyChain(entries);

    expect(result.ok).toBe(true);
    expect(result.checked).toBe(3);
    expect(result.headHash).toBe(entries[0]!.hash);
  });

  it("rejects a record whose content was edited", async () => {
    const entries = await buildChain(["a.one", "a.two", "a.three"]);
    const victim = entries[1]!;
    entries[1] = { ...victim, hash_material: victim.hash_material.replace("{}", '{"x":1}') };

    const result = await verifyChain(entries);

    expect(result.ok).toBe(false);
    expect(result.hashMismatchAt).toBe(victim.id);
    expect(result.headHash).toBe("");
  });

  it("rejects a chain with an entry removed from the middle", async () => {
    // A per-record hash check alone passes here — every remaining record still
    // hashes correctly. Only the prev_hash link catches the deletion.
    const entries = await buildChain(["a.one", "a.two", "a.three", "a.four"]);
    const withoutMiddle = [entries[0]!, entries[1]!, entries[3]!];

    const result = await verifyChain(withoutMiddle);

    expect(result.ok).toBe(false);
    expect(result.hashMismatchAt).toBeUndefined();
    expect(result.brokenLinkAt).toBe(entries[1]!.id);
  });

  it("rejects a reordered chain", async () => {
    const entries = await buildChain(["a.one", "a.two", "a.three"]);
    const swapped = [entries[1]!, entries[0]!, entries[2]!];

    const result = await verifyChain(swapped);

    expect(result.ok).toBe(false);
    expect(result.brokenLinkAt ?? result.hashMismatchAt).toBeTruthy();
  });

  it("treats an empty window as vacuously intact rather than broken", async () => {
    const result = await verifyChain([]);

    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
    expect(result.headHash).toBe("");
  });

  it("reports progress once per record so a long chain can yield frames", async () => {
    const entries = await buildChain(["a.one", "a.two", "a.three"]);
    const seen: Array<[number, number]> = [];

    await verifyChain(entries, (current, total) => {
      seen.push([current, total]);
    });

    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });
});

describe("sha256Hex", () => {
  it("matches the known digest of the empty string", async () => {
    // Pins the encoding and hex padding against the published SHA-256 test vector,
    // which is what makes the server's Python digests comparable.
    await expect(sha256Hex("")).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
