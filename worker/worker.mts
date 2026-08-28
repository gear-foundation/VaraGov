// VaraGov worker: listens to finalized blocks, persists referenda events,
// snapshots votes near referendum finish, and keeps a resume cursor.
// Run: npx tsx worker/worker.mts   (DATABASE_URL in .env)
import "dotenv/config";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { prisma } from "../lib/server/db";
import {
  TERMINAL_EVENTS,
  handleTerminal,
  recordTallySnapshot,
  snapshotVotes,
  tallyFromEvent,
  upsertFromState,
} from "../lib/server/indexer";
import { parseReferendumInfo, ONGOING_PHASES } from "../lib/chain/referenda";

const ARCHIVE_ENDPOINTS = [
  "wss://archive-rpc.vara-network.io",
  "wss://archive.vara-network.io",
];
const SNAPSHOT_INTERVAL = 100; // blocks (~5 min) between ongoing-referenda syncs

/* eslint-disable @typescript-eslint/no-explicit-any */

async function processBlock(api: ApiPromise, n: number): Promise<void> {
  const hash = await api.rpc.chain.getBlockHash(n);
  const apiAt: any = await api.at(hash);
  const events: any = await apiAt.query.system.events();

  const dirty = new Set<number>();
  for (const { event } of events) {
    if (event.section !== "referenda") continue;
    const index = (event.data[0] as any)?.toNumber?.();
    if (typeof index !== "number") continue;

    const phase = TERMINAL_EVENTS[event.method];
    if (phase) {
      const tally = tallyFromEvent(event.data);
      console.log(`[worker] #${n} referenda.${event.method} ref=${index}`);
      await handleTerminal(api, index, phase, tally, n);
    } else {
      dirty.add(index);
    }
  }
  for (const index of dirty) {
    // Catch-up must reflect this historical block, not whatever state is current now.
    await upsertFromState(apiAt, index);
  }
}

async function syncOngoing(api: ApiPromise, atBlock: number): Promise<void> {
  const entries = await api.query.referenda.referendumInfoFor.entries();
  for (const [key, info] of entries) {
    const index = (key.args[0] as any).toNumber();
    const ref = parseReferendumInfo(index, info);
    if (!ref || !ONGOING_PHASES.includes(ref.phase)) continue;
    await upsertFromState(api, index);
    await recordTallySnapshot(api, index, atBlock);
    if (ref.trackId !== null) {
      await snapshotVotes(api, index, ref.trackId, atBlock);
    }
  }
}

async function main() {
  const api = await ApiPromise.create({
    provider: new WsProvider(ARCHIVE_ENDPOINTS),
    noInitWarn: true,
  });
  console.log(`[worker] connected: ${(await api.rpc.system.chain()).toString()}`);

  const head = (await api.rpc.chain.getHeader(await api.rpc.chain.getFinalizedHead()))
    .number.toNumber();
  const cursor = await prisma.workerCursor.findUnique({ where: { id: 1 } });
  let last = cursor?.lastBlock ?? head; // first run: start at head; history comes from backfill

  // Catch up everything missed while the worker was down.
  if (head > last) {
    console.log(`[worker] catching up ${last + 1}..${head} (${head - last} blocks)`);
    for (let n = last + 1; n <= head; n++) {
      await processBlock(api, n);
      if (n % 1000 === 0) {
        await prisma.workerCursor.upsert({
          where: { id: 1 },
          create: { id: 1, lastBlock: n },
          update: { lastBlock: n },
        });
        console.log(`[worker] catch-up at #${n}`);
      }
    }
  }
  last = Math.max(last, head);
  await prisma.workerCursor.upsert({
    where: { id: 1 },
    create: { id: 1, lastBlock: last },
    update: { lastBlock: last },
  });
  await syncOngoing(api, last);

  // Live subscription. Blocks are processed strictly in order.
  let processing = Promise.resolve();
  await api.rpc.chain.subscribeFinalizedHeads((header) => {
    const target = header.number.toNumber();
    processing = processing.then(async () => {
      for (let n = last + 1; n <= target; n++) {
        try {
          await processBlock(api, n);
          if (n % SNAPSHOT_INTERVAL === 0) await syncOngoing(api, n);
          await prisma.workerCursor.upsert({
            where: { id: 1 },
            create: { id: 1, lastBlock: n },
            update: { lastBlock: n },
          });
          last = n;
        } catch (e) {
          console.error(`[worker] error at block #${n}:`, e);
          return; // retry from `last` on the next head
        }
      }
    });
  });
  console.log(`[worker] live from #${last}`);
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
