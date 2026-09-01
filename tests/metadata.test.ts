import assert from "node:assert/strict";
import test from "node:test";
import {
  anchorReferendumMetadata,
  hexByteLength,
} from "../lib/chain/metadata";

test("metadata preimage length is measured in bytes", () => {
  assert.equal(hexByteLength("0x00ff10"), 3);
  assert.throws(() => hexByteLength("0x0"), /even-length hex/);
  assert.throws(() => hexByteLength("hello"), /even-length hex/);
});

test("metadata anchor notes a missing preimage before setMetadata", async () => {
  const calls: string[] = [];
  const api = {
    query: { preimage: { preimageFor: async (key: unknown) => {
      calls.push(`query:${JSON.stringify(key)}`);
      return { isSome: false };
    } } },
    tx: {
      preimage: { notePreimage: (hex: string) => ({ name: `note:${hex}` }) },
      referenda: { setMetadata: (index: number, hash: string) => ({ name: `metadata:${index}:${hash}` }) },
    },
  };
  const send = async (tx: { name: string }) => {
    calls.push(tx.name);
    return true;
  };

  const result = await anchorReferendumMetadata(
    api as never,
    80,
    "0xhash",
    "0x0102",
    send as never,
  );

  assert.deepEqual(result, { ok: true, preimage: "noted" });
  assert.deepEqual(calls, [
    'query:["0xhash",2]',
    "note:0x0102",
    "metadata:80:0xhash",
  ]);
});

test("metadata anchor skips an existing preimage", async () => {
  const sent: string[] = [];
  const api = {
    query: { preimage: { preimageFor: async () => ({ isSome: true }) } },
    tx: {
      preimage: { notePreimage: () => ({ name: "note" }) },
      referenda: { setMetadata: () => ({ name: "metadata" }) },
    },
  };

  const result = await anchorReferendumMetadata(
    api as never,
    80,
    "0xhash",
    "0x0102",
    (async (tx: { name: string }) => {
      sent.push(tx.name);
      return true;
    }) as never,
  );

  assert.deepEqual(result, { ok: true, preimage: "existing" });
  assert.deepEqual(sent, ["metadata"]);
});
