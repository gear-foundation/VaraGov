// Self-check for curve math: run with `npx tsx scripts/check-curves.ts`.
import assert from "node:assert";
import { BN } from "@polkadot/util";
import { curveThreshold, approvalFraction, supportFraction } from "../lib/chain/curves";

// linearDecreasing: ceil 100% -> floor 50% over the full period
const lin = {
  kind: "linearDecreasing" as const,
  length: 1e9,
  floor: 5e8,
  ceil: 1e9,
};
assert.strictEqual(curveThreshold(lin, 0), 1);
assert.strictEqual(curveThreshold(lin, 1), 0.5);
assert.ok(Math.abs(curveThreshold(lin, 0.5) - 0.75) < 1e-6);

// reciprocal must be monotonically decreasing and clamped >= 0
const rec = {
  kind: "reciprocal" as const,
  factor: new BN("222222224"),
  xOffset: new BN("333333335"),
  yOffset: new BN("-333333332"),
};
let prev = Infinity;
for (let i = 0; i <= 100; i++) {
  const y = curveThreshold(rec, i / 100);
  assert.ok(y >= 0 && y <= prev, `not monotone at x=${i / 100}: ${y} > ${prev}`);
  prev = y;
}
// Known values for this Polkadot support curve: y(0) ≈ 33.33%, y(1) ≈ -16.6% -> clamped 0
assert.ok(Math.abs(curveThreshold(rec, 0) - 0.3333) < 0.001);
assert.strictEqual(curveThreshold(rec, 1), 0);

assert.strictEqual(approvalFraction(new BN(0), new BN(0)), null);
assert.strictEqual(approvalFraction(new BN(3), new BN(1)), 0.75);
assert.strictEqual(supportFraction(new BN(50), new BN(200)), 0.25);

console.log("check-curves: OK");
