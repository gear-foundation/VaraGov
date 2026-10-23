import BigNumber from "bignumber.js";
import { BN } from "@polkadot/util";
import { DECIMALS } from "./format";

export type ParsedVaraAmount =
  | { ok: true; planck: BN }
  | { ok: false; message: string };

const MINIMUM_VARA = `0.${"0".repeat(DECIMALS - 1)}1`;

/** Parses a user-entered VARA amount without silently rounding precision away. */
export function parseVaraAmount(input: string): ParsedVaraAmount {
  const value = input.trim();
  if (!value) return { ok: false, message: "Enter an amount." };
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) {
    return { ok: false, message: "Enter a valid positive amount." };
  }

  const decimal = new BigNumber(value);
  if (!decimal.isFinite() || decimal.lte(0)) {
    return { ok: false, message: "Enter a valid positive amount." };
  }
  if ((decimal.decimalPlaces() ?? 0) > DECIMALS) {
    return {
      ok: false,
      message: `Use no more than ${DECIMALS} decimal places (minimum ${MINIMUM_VARA} VARA).`,
    };
  }

  const planck = new BN(decimal.times(new BigNumber(10).pow(DECIMALS)).toFixed(0));
  if (planck.isZero()) {
    return {
      ok: false,
      message: `Amount must be at least ${MINIMUM_VARA} VARA.`,
    };
  }
  return { ok: true, planck };
}
