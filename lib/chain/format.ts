import BigNumber from "bignumber.js";
import { BN } from "@polkadot/util";

export const DECIMALS = 12;
export const BLOCK_TIME_MS = 3000;
export const SS58_PREFIX = 137;

// 1_500 VARA -> "1.5K VARA"; keeps full precision under 1000.
export function formatVara(planck: BN | string, opts?: { compact?: boolean }): string {
  const v = new BigNumber(planck.toString()).div(new BigNumber(10).pow(DECIMALS));
  const compact = opts?.compact !== false;
  if (compact && v.gte(1_000_000)) return `${trim(v.div(1_000_000))}M`;
  if (compact && v.gte(10_000)) return `${trim(v.div(1_000))}K`;
  return trim(v);
}

function trim(v: BigNumber): string {
  return v.decimalPlaces(2, BigNumber.ROUND_DOWN).toFormat();
}

export function shortAddress(addr: string): string {
  if (addr.length <= 13) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

// "13 days" / "4 hours" / "10 minutes" for a duration in blocks.
export function blocksToDuration(blocks: number): string {
  const ms = blocks * BLOCK_TIME_MS;
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

// Estimated wall-clock date for a future/past block, given the current block.
export function blockToDate(block: number, currentBlock: number): Date {
  return new Date(Date.now() + (block - currentBlock) * BLOCK_TIME_MS);
}

export function percent(x: number | null): string {
  if (x === null) return "—";
  return `${(x * 100).toFixed(1)}%`;
}
