import assert from "node:assert/strict";
import test from "node:test";
import { stringToU8a, u8aToHex, u8aWrapBytes } from "@polkadot/util";
import {
  cryptoWaitReady,
  encodeAddress,
  sr25519PairFromSeed,
  sr25519Sign,
} from "@polkadot/util-crypto";
import { MAX_CONTENT } from "../lib/sima";
import { verifySimaMessage } from "../lib/server/verify";

function unsigned(payload: unknown) {
  return {
    payloadJson: JSON.stringify(payload),
    address: "not-an-address",
    signature: "0x00",
  };
}

test("rejects non-object payloads without throwing", () => {
  for (const payload of [null, [], "message", 1]) {
    assert.match((verifySimaMessage(unsigned(payload)) as { error: string }).error, /object/);
  }
});

test("validates field types and UTF-8 byte limits before crypto work", () => {
  const base = {
    action: "comment",
    network: "vara",
    refIndex: 1,
    timestamp: Date.now(),
  };
  assert.match(
    (verifySimaMessage(unsigned({ ...base, content: 42 })) as { error: string }).error,
    /string/,
  );
  assert.match(
    (
      verifySimaMessage(unsigned({ ...base, content: "界".repeat(Math.ceil(MAX_CONTENT / 3) + 1) })) as {
        error: string;
      }
    ).error,
    /too (large|long)/i,
  );
});

test("accepts extension-wrapped signatures and returns the signed payload", async () => {
  await cryptoWaitReady();
  const pair = sr25519PairFromSeed(new Uint8Array(32).fill(7));
  // The same account may arrive in a wallet-specific SS58 format.
  const address = encodeAddress(pair.publicKey, 42);
  const payload = {
    action: "comment",
    network: "vara",
    refIndex: 7,
    content: "A signed comment",
    timestamp: Date.now(),
  } as const;
  const payloadJson = JSON.stringify(payload);
  const signature = u8aToHex(
    sr25519Sign(u8aWrapBytes(stringToU8a(payloadJson)), pair),
  );

  const result = verifySimaMessage({ payloadJson, address, signature });
  assert.ok(!("error" in result), "error" in result ? result.error : undefined);
  assert.deepEqual(result.payload, payload);
  assert.equal(result.address, encodeAddress(pair.publicKey, 137));
  assert.match(result.contentHash, /^0x[0-9a-f]{64}$/);
});

test("malformed addresses and signatures produce a client error", () => {
  const result = verifySimaMessage(
    unsigned({
      action: "comment",
      network: "vara",
      refIndex: 1,
      content: "hello",
      timestamp: Date.now(),
    }),
  );
  assert.ok("error" in result);
  assert.match(result.error, /address|signature/i);
});
