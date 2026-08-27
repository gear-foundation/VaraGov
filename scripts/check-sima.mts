// End-to-end check of the SIMA content API against a running dev server.
// Run: npx tsx scripts/check-sima.ts  (dev server on :3000, postgres up)
import assert from "node:assert";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { stringToU8a, u8aToHex, u8aWrapBytes } from "@polkadot/util";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

await cryptoWaitReady();
const keyring = new Keyring({ type: "sr25519", ss58Format: 137 });
const pair = keyring.addFromUri("//VaraGovCheck" + Date.now());

function sign(payloadJson: string): string {
  // Mimic extension signRaw: bytes are wrapped in <Bytes>…</Bytes>.
  return u8aToHex(pair.sign(u8aWrapBytes(stringToU8a(payloadJson))));
}

async function post(url: string, payload: unknown, signature?: string) {
  const payloadJson = JSON.stringify(payload);
  const res = await fetch(BASE + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payloadJson,
      address: pair.address,
      signature: signature ?? sign(payloadJson),
    }),
  });
  return { status: res.status, body: await res.json() };
}

// 1. Bad signature is rejected.
let r = await post(
  "/api/comments/77",
  { action: "comment", network: "vara", refIndex: 77, content: "hi", timestamp: Date.now() },
  "0x" + "11".repeat(64),
);
assert.strictEqual(r.status, 400);
assert.match(r.body.error, /[Ss]ignature/);

// 2. Stale timestamp is rejected.
r = await post("/api/comments/77", {
  action: "comment", network: "vara", refIndex: 77, content: "hi",
  timestamp: Date.now() - 3600_000,
});
assert.strictEqual(r.status, 400);
assert.match(r.body.error, /timestamp/i);

// 3. Valid signature from an unfunded account fails the anti-spam balance check.
r = await post("/api/comments/77", {
  action: "comment", network: "vara", refIndex: 77, content: "hi", timestamp: Date.now(),
});
assert.strictEqual(r.status, 403);
assert.match(r.body.error, /existential deposit/i);

// 4. provide_context from a non-proposer is rejected.
r = await post("/api/content", {
  action: "provide_context", network: "vara", refIndex: 77,
  title: "Test", content: "x", timestamp: Date.now(),
});
assert.strictEqual(r.status, 403);
assert.match(r.body.error, /proposer/i);

// 5. Titles listing works.
const titles = await fetch(BASE + "/api/content").then((x) => x.json());
assert.ok(Array.isArray(titles.titles));

console.log("check-sima: OK (signature, timestamp, balance gate, proposer gate, listing)");
