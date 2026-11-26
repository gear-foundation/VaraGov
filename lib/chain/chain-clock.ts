import type { ApiPromise } from "@polkadot/api";
export type ChainClock = { block: number; timestamp: number; msPerBlock: number | null };

export async function readChainClock(api: ApiPromise, hash: string, block: number, archive = async () => api): Promise<ChainClock> {
  const at = await api.at(hash);
  const timestamp = Number((await at.query.timestamp.now()).toString());
  const sample = Math.min(block, 1200);
  let msPerBlock: number | null = null;
  if (sample > 0) {
    try {
      const history = await archive();
      const before = await history.at(await history.rpc.chain.getBlockHash(block - sample));
      const elapsed = timestamp - Number((await before.query.timestamp.now()).toString());
      if (elapsed > 0) msPerBlock = elapsed / sample;
    } catch { /* Keep the observed block timestamp when historical RPC is unavailable. */ }
  }
  return { block, timestamp, msPerBlock };
}

export function estimatedDate(clock: ChainClock | undefined, block: number | null | undefined) {
  if (!clock || clock.msPerBlock === null || block == null) return null;
  return new Date(clock.timestamp + (block - clock.block) * clock.msPerBlock);
}

export function dateLabel(date: Date | null) {
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "Date unavailable";
}

export function estimatedEraDate(
  clock: ChainClock,
  era: number,
  pool: { activeStart: number | null; activeIndex: number | null; blocksPerEra: number | null },
) {
  if (pool.activeStart === null || pool.activeIndex === null || !pool.blocksPerEra || !clock.msPerBlock) return null;
  return new Date(pool.activeStart + (era - pool.activeIndex) * pool.blocksPerEra * clock.msPerBlock);
}
