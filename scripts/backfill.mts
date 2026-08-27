// One-time backfill of all historical referenda from the archive node:
// final tallies from terminal events, voter lists from parent-block state.
// Run: npx tsx scripts/backfill.mts   (DATABASE_URL in .env)
import "dotenv/config";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { prisma } from "../lib/server/db";
import {
  TERMINAL_EVENTS,
  handleTerminal,
  tallyFromEvent,
  upsertFromState,
} from "../lib/server/indexer";
import { parseReferendumInfo } from "../lib/chain/referenda";

const ARCHIVE_ENDPOINTS = [
  "wss://archive-rpc.vara-network.io",
  "wss://archive.vara-network.io",
];

/* eslint-disable @typescript-eslint/no-explicit-any */

async function main() {
  const api = await ApiPromise.create({
    provider: new WsProvider(ARCHIVE_ENDPOINTS),
    noInitWarn: true,
  });
  const count = (
    (await api.query.referenda.referendumCount()) as any
  ).toNumber();
  console.log(`[backfill] ${count} referenda`);

  for (let index = 0; index < count; index++) {
    const existing = await prisma.referendum.findUnique({ where: { index } });
    if (existing?.finalTally || (existing?.status && existing.status !== "unknown" && !existing.decidedAt && existing.trackId !== null)) {
      // Already backfilled (terminal with tally) or live row kept fresh by the worker.
      if (existing.finalTally) {
        console.log(`[backfill] #${index} already done, skip`);
        continue;
      }
    }

    const info = await api.query.referenda.referendumInfoFor(index);
    const ref = parseReferendumInfo(index, info);
    if (!ref) {
      console.log(`[backfill] #${index}: no state (killed & cleaned?), skip`);
      continue;
    }

    if (ref.decidedAt === null) {
      await upsertFromState(api, index);
      console.log(`[backfill] #${index}: ongoing, state saved`);
      continue;
    }

    // Terminal: read the terminal event from the block where it was decided.
    const hash = await api.rpc.chain.getBlockHash(ref.decidedAt);
    const apiAt: any = await api.at(hash);
    const events: any = await apiAt.query.system.events();
    let done = false;
    for (const { event } of events) {
      if (event.section !== "referenda") continue;
      const phase = TERMINAL_EVENTS[event.method];
      if (!phase) continue;
      const evIndex = (event.data[0] as any)?.toNumber?.();
      if (evIndex !== index) continue;
      const tally = tallyFromEvent(event.data);
      await handleTerminal(api, index, phase, tally, ref.decidedAt);
      const votes = await prisma.vote.count({ where: { refIndex: index } });
      console.log(
        `[backfill] #${index}: ${phase} at #${ref.decidedAt}, tally=${tally ? "yes" : "no"}, votes=${votes}`,
      );
      done = true;
      break;
    }
    if (!done) {
      // Event not in that block (unexpected) — save what the state has.
      await upsertFromState(api, index);
      console.log(`[backfill] #${index}: terminal event NOT found at #${ref.decidedAt} — state only`);
    }
  }

  console.log("[backfill] complete");
  await api.disconnect();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("[backfill] fatal:", e);
  process.exit(1);
});
