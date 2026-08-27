import BigNumber from "bignumber.js";
import { BN } from "@polkadot/util";
import type { CurveDef } from "./tracks";

const BILL = new BigNumber(1e9);

// x in [0, 1] — fraction of the decision period elapsed. Returns threshold in [0, 1].
export function curveThreshold(curve: CurveDef, x: number): number {
  const xb = BigNumber.min(new BigNumber(x).times(BILL), BILL);
  if (curve.kind === "linearDecreasing") {
    const { length, floor, ceil } = curve;
    const xCapped = BigNumber.min(xb, length);
    const y = new BigNumber(ceil).minus(
      new BigNumber(ceil - floor).times(xCapped).idiv(length),
    );
    return BigNumber.max(y, 0).div(BILL).toNumber();
  }
  // reciprocal: y = factor / (x + xOffset) + yOffset  (all perbill)
  const factor = new BigNumber(curve.factor.toString());
  const xOff = new BigNumber(curve.xOffset.toString());
  const yOff = new BigNumber(curve.yOffset.toString());
  const y = factor.times(BILL).idiv(xb.plus(xOff)).plus(yOff);
  return BigNumber.max(y, 0).div(BILL).toNumber();
}

// Current approval: ayes / (ayes + nays); null when nobody voted.
export function approvalFraction(ayes: BN, nays: BN): number | null {
  const a = new BigNumber(ayes.toString());
  const n = new BigNumber(nays.toString());
  const total = a.plus(n);
  if (total.isZero()) return null;
  return a.div(total).toNumber();
}

// Current support: tally.support / active issuance.
export function supportFraction(support: BN, activeIssuance: BN): number | null {
  const s = new BigNumber(support.toString());
  const i = new BigNumber(activeIssuance.toString());
  if (i.isZero()) return null;
  return s.div(i).toNumber();
}

export function decidingProgress(
  currentBlock: number,
  decidingSince: number | null,
  decisionPeriod: number,
): number {
  if (decidingSince === null) return 0;
  return Math.min(Math.max((currentBlock - decidingSince) / decisionPeriod, 0), 1);
}
