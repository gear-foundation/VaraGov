import BigNumber from "bignumber.js";
import { BN } from "@polkadot/util";
import type { CurveDef } from "./tracks";

const BILL = new BigNumber(1e9);

// x in [0, 1] — fraction of the decision period elapsed. Returns threshold in [0, 1].
export function curveThresholdParts(curve: CurveDef, progressParts: number): number {
  const xb = new BigNumber(Math.min(Math.max(Math.floor(progressParts), 0), 1e9));
  if (curve.kind === "linearDecreasing") {
    const { length, floor, ceil } = curve;
    if (length === 0) return floor;
    const xCapped = BigNumber.min(xb, length);
    // Match Perbill division and multiplication: each operation rounds down.
    const ratio = xCapped.times(BILL).idiv(length);
    const y = new BigNumber(ceil).minus(ratio.times(ceil - floor).idiv(BILL));
    return BigNumber.min(BILL, BigNumber.max(y, 0)).toNumber();
  }
  // reciprocal: y = factor / (x + xOffset) + yOffset  (all perbill)
  const factor = new BigNumber(curve.factor.toString());
  const xOff = new BigNumber(curve.xOffset.toString());
  const yOff = new BigNumber(curve.yOffset.toString());
  const denominator = xb.plus(xOff);
  if (denominator.isZero()) return 1e9;
  const y = factor.times(BILL).div(denominator).integerValue(BigNumber.ROUND_FLOOR).plus(yOff);
  return BigNumber.min(BILL, BigNumber.max(y, 0)).toNumber();
}

export function curveThreshold(curve: CurveDef, x: number): number {
  return curveThresholdParts(curve, Math.floor(x * 1e9)) / 1e9;
}

export function fractionParts(numerator: BN, denominator: BN): number {
  if (denominator.isZero()) return 0;
  return BigNumber.min(BILL, BigNumber.max(0,
    new BigNumber(numerator.toString()).times(BILL).idiv(denominator.toString()),
  )).toNumber();
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
