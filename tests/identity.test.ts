import assert from "node:assert/strict";
import test from "node:test";
import { parseChainIdentity } from "../lib/chain/identity";

test("parses a judged raw on-chain display identity", () => {
  assert.deepEqual(
    parseChainIdentity([
      {
        judgements: [["0", "Reasonable"]],
        info: { display: { Raw: "ukint-vs" } },
      },
      null,
    ]),
    { display: "ukint-vs", verified: true },
  );
});

test("keeps unjudged identities visible without a verification mark", () => {
  assert.deepEqual(
    parseChainIdentity({
      judgements: [],
      info: { display: { Raw: "Alice" } },
    }),
    { display: "Alice", verified: false },
  );
});

test("falls back when an identity has no display value", () => {
  assert.equal(
    parseChainIdentity([{ judgements: [], info: { display: "None" } }, null]),
    null,
  );
});
