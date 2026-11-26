import { test } from "node:test";
import assert from "node:assert/strict";
import { BN } from "@polkadot/util";
import { proposalSummary, requiredSupport, selectSpendTrack, spendLimits, TREASURY_ADDRESS } from "../lib/chain/treasury";
import { canClaim } from "../lib/chain/treasury-spend";
import { decodeCallTree } from "../lib/chain/call-decoder";
import type { TrackInfo } from "../lib/chain/tracks";

test("grant selection refuses limits from another runtime and uses exact cap boundaries", () => {
  const config = { specVersion: 42, limits: {
    small_tipper: "1000", big_tipper: "5000", small_spender: "500000",
    medium_spender: "10000000", big_spender: "50000000", treasurer: "100000000",
  } };
  assert.equal(spendLimits(43, config), null);
  const limits = spendLimits(42, config)!;
  const tracks = Object.keys(limits).map((name) => ({ name } as TrackInfo));
  const edge = new BN(limits.medium_spender);
  assert.equal(selectSpendTrack(tracks, limits, edge)?.name, "medium_spender");
  assert.equal(selectSpendTrack(tracks, limits, edge.addn(1))?.name, "big_spender");
  assert.equal(selectSpendTrack(tracks, limits, new BN(limits.treasurer).addn(1)), undefined);
});

test("nested SCALE call JSON preserves a large treasury amount and a delayed payout", () => {
  const registry = { findMetaCall: (index: Uint8Array) => index[0] === 1
    ? { section: "utility", method: "batchAll", meta: { args: [], docs: [] } }
    : { section: "treasury", method: "spend", meta: { args: [{ name: "validFrom", type: "Option<u32>" }], docs: [] } }
  };
  const root = decodeCallTree(registry, { callIndex: "0x0100", args: { calls: [{
    callIndex: "0x0200", args: { amount: "0x00000000000000008ac7230489e80000", beneficiary: TREASURY_ADDRESS, valid_from: 42 },
  }] } });
  const result = proposalSummary(root);
  assert.equal(result.complex, true);
  assert.equal(result.blockedTreasuryCall, true);
  assert.deepEqual(result.spends, [{ amount: "10000000000000000000", beneficiary: TREASURY_ADDRESS, legacy: false, validFrom: 42 }]);
});

test("payout permits first payable block and retry but excludes expiry and an existing payment", () => {
  const spend = { index: 2, amount: "123", beneficiary: TREASURY_ADDRESS, validFrom: 10, expireAt: 15, status: "pending" as const };
  assert.equal(canClaim(spend, 9), false);
  assert.equal(canClaim(spend, 10), true);
  assert.equal(canClaim({ ...spend, status: "failed" }, 14), true);
  assert.equal(canClaim({ ...spend, status: "attempted" }, 14), false);
  assert.equal(canClaim(spend, 15), false);
});

test("required support rounds up to the first integer balance meeting the chain threshold", () => {
  const track = { minSupport: { kind: "linearDecreasing", length: 1_000_000_000, floor: 100_000_000, ceil: 300_000_000 } } as TrackInfo;
  assert.equal(requiredSupport(track, new BN(11)), "2");
  assert.equal(requiredSupport(track, new BN(11), 0), "4");
});
