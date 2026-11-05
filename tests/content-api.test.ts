import assert from "node:assert/strict";
import test from "node:test";
import { stringToU8a, u8aToHex, u8aWrapBytes } from "@polkadot/util";
import { cryptoWaitReady, encodeAddress, sr25519PairFromSeed, sr25519Sign } from "@polkadot/util-crypto";
import { listContent, readContent, saveContent } from "../lib/server/content-api";
import type { GovernanceKind, SimaPayload } from "../lib/sima";
import type { Referendum } from "../lib/chain/referenda";

const pair = sr25519PairFromSeed(new Uint8Array(32).fill(11));
const address = encodeAddress(pair.publicKey, 42);
const proposer = encodeAddress(pair.publicKey, 137);
function request(patch: Partial<SimaPayload> = {}) {
  const payload = { action: "provide_context", network: "vara", governance: "fellowship", refIndex: 75,
    title: "A clear proposal", content: "## Motivation\nSome context", timestamp: Date.now(), ...patch };
  const payloadJson = JSON.stringify(payload);
  return new Request("http://localhost/api/content", { method: "POST", body: JSON.stringify({
    payloadJson, address, signature: u8aToHex(sr25519Sign(u8aWrapBytes(stringToU8a(payloadJson)), pair)),
  }) });
}
function services(owner = proposer) {
  const records = { token: new Map<number, Record<string, unknown>>(), fellowship: new Map<number, Record<string, unknown>>() };
  const reads: string[] = [];
  const repository = (kind: GovernanceKind) => ({
    findUnique: async ({ where }: { where: { index: number } }) => records[kind].get(where.index) ?? null,
    findMany: async () => Array.from(records[kind].values()),
    upsert: async ({ where, create, update }: { where: { index: number }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      records[kind].set(where.index, records[kind].has(where.index) ? { ...records[kind].get(where.index), ...update } : create);
    },
  });
  const db = { referendum: repository("token"), fellowshipContent: repository("fellowship"),
    $executeRaw: async () => 1, $transaction: async (fn: (tx: unknown) => unknown) => fn(db) };
  const resolve = async (kind: GovernanceKind, index: number) => {
    reads.push(`${kind}:${index}`);
    return { index, proposer: owner, trackId: 3, phase: "approved" } as Referendum;
  };
  return { records, reads, deps: { db, resolve } as unknown as NonNullable<Parameters<typeof saveContent>[2]> };
}

test("Fellowship content writes are signed, proposer-only and isolated from token-holder content", async () => {
  await cryptoWaitReady();
  const { records, deps } = services();
  records.token.set(75, { title: "Original token-holder title" });
  assert.equal((await saveContent("fellowship", request(), deps)).status, 200);
  assert.equal(records.fellowship.get(75)?.proposer, proposer);
  assert.equal(records.fellowship.get(75)?.title, "A clear proposal");
  assert.equal(records.token.get(75)?.title, "Original token-holder title");
  assert.equal((await readContent("fellowship", 75, deps)).status, 200);
  const denied = services(encodeAddress(new Uint8Array(32).fill(5), 137));
  assert.equal((await saveContent("fellowship", request(), denied.deps)).status, 403);
  assert.equal(denied.records.fellowship.size, 0);
});

test("a signed governance scope cannot be replayed against the other endpoint", async () => {
  await cryptoWaitReady();
  const { deps, reads } = services();
  assert.equal((await saveContent("token", request(), deps)).status, 400);
  assert.equal((await saveContent("fellowship", request({ governance: "token" }), deps)).status, 400);
  assert.equal((await saveContent("fellowship", request({ governance: undefined }), deps)).status, 400);
  assert.equal(reads.length, 0);
  // Old token-holder messages remain valid, but are scoped exclusively to token holders.
  assert.equal((await saveContent("token", request({ governance: undefined }), deps)).status, 200);
});

test("a replay or delayed edit cannot overwrite a newer signed description", async () => {
  await cryptoWaitReady();
  const { deps, records } = services();
  const timestamp = Date.now();
  assert.equal((await saveContent("fellowship", request({ timestamp }), deps)).status, 200);
  assert.equal((await saveContent("fellowship", request({ timestamp, title: "Replay" }), deps)).status, 409);
  assert.equal((await saveContent("fellowship", request({ timestamp: timestamp - 1, title: "Older" }), deps)).status, 409);
  assert.equal(records.fellowship.get(75)?.title, "A clear proposal");
  assert.equal((await saveContent("fellowship", request({ timestamp: timestamp + 1, title: "Updated" }), deps)).status, 200);
});

test("unsaved Fellowship content still exposes the verified proposer to the editor", async () => {
  const { deps } = services();
  const body = await (await readContent("fellowship", 75, deps)).json();
  assert.equal(body.content.proposer, proposer);
  assert.equal(body.content.title, null);
});

test("listing includes comment totals including replies and does not mix governance sections", async () => {
  const { deps, records } = services();
  records.token.set(75, { index: 75, title: "Token", trackId: 1, contentMd: "Text", _count: { comments: 3 } });
  records.fellowship.set(75, { index: 75, title: "Fellowship", trackId: 3, contentMd: "Other" });
  const token = await (await listContent("token", deps)).json();
  const fellowship = await (await listContent("fellowship", deps)).json();
  assert.equal(token.titles[0].commentCount, 3);
  assert.equal(fellowship.titles[0].title, "Fellowship");
  assert.equal(fellowship.titles[0].commentCount, undefined);
});
