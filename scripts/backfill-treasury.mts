// Replay a selected finalized interval without changing the referendum worker cursor.
import "dotenv/config";
import { getArchiveApi } from "../lib/server/chain";
import { prisma } from "../lib/server/db";
import { recordTreasuryBlock } from "../lib/server/treasury-events";

const [fromText, throughText] = process.argv.slice(2);
const from = Number(fromText);
const through = Number(throughText);
if (!Number.isInteger(from) || from < 1 || !Number.isInteger(through) || through < from) {
  throw new Error("Usage: npm run backfill:treasury -- <first-block> <last-block>");
}

const api = await getArchiveApi();
try {
  const head = await api.rpc.chain.getHeader(await api.rpc.chain.getFinalizedHead());
  if (through > head.number.toNumber()) throw new Error("The interval must be finalized.");
  for (let block = from; block <= through; block++) {
    const hash = await api.rpc.chain.getBlockHash(block);
    const at = await api.at(hash);
    await recordTreasuryBlock(api, at, hash.toHex(), block, await at.query.system.events());
    if (block % 1000 === 0 || block === through) console.log(`[treasury] indexed through #${block}`);
  }
  const coverage = await prisma.treasuryHistoryCursor.findUnique({ where: { id: 1 } });
  if (coverage && from < coverage.fromBlock && through + 1 >= coverage.fromBlock) {
    await prisma.treasuryHistoryCursor.updateMany({
      where: { id: 1, fromBlock: coverage.fromBlock },
      data: { fromBlock: from },
    });
  }
} finally {
  await Promise.all([api.disconnect(), prisma.$disconnect()]);
}
