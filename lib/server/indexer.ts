// Shared indexing logic for the worker (live) and the backfill script (history).
import type { ApiPromise } from "@polkadot/api";
import { parseReferendumInfo, type Phase } from "../chain/referenda";
import { prisma } from "./db";
import {
  parseSnapshotVote,
  type SnapshotVote,
} from "./indexer-parsers";

export { tallyFromEvent } from "./indexer-parsers";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const TERMINAL_EVENTS: Record<string, Phase> = {
  Confirmed: "approved",
  Rejected: "rejected",
  Cancelled: "cancelled",
  TimedOut: "timedOut",
  Killed: "killed",
};

// Refresh a referendum row from (current or historical) chain state.
export async function upsertFromState(
  api: ApiPromise,
  index: number,
): Promise<void> {
  const info = await api.query.referenda.referendumInfoFor(index);
  const ref = parseReferendumInfo(index, info);
  if (!ref) return;
  const data = {
    trackId: ref.trackId ?? undefined,
    proposer: ref.proposer ?? undefined,
    proposalHash: ref.proposalHash ?? undefined,
    proposalLen: ref.proposalLen ?? undefined,
    status: ref.phase,
    submittedAt: ref.submittedAt ?? undefined,
    decidingSince: ref.decidingSince ?? undefined,
    decidedAt: ref.decidedAt ?? undefined,
  };
  await prisma.referendum.upsert({
    where: { index },
    create: { index, ...data },
    update: data,
  });
}

// Snapshot the per-voter breakdown for one referendum from votingFor state.
// `apiAt` should be an api (or api.at(hash)) whose state still contains the votes —
// for finished referenda that means a block at/just before the terminal event.
export async function snapshotVotes(
  apiAt: any,
  refIndex: number,
  trackId: number,
  atBlock: number,
): Promise<number> {
  const entries = await apiAt.query.convictionVoting.votingFor.entries();
  const snapshot: SnapshotVote[] = [];
  for (const [key, voting] of entries) {
    const [voter, track] = key.args as [any, any];
    if (track.toNumber() !== trackId) continue;
    if (!(voting as any).isCasting) continue;
    const votes = (voting as any).asCasting.votes;
    for (const [idx, vote] of votes) {
      if (idx.toNumber() !== refIndex) continue;
      const parsed = parseSnapshotVote(vote);
      if (!parsed) continue;
      snapshot.push({
        refIndex,
        voter: voter.toString(),
        atBlock,
        ...parsed,
      });
    }
  }

  // A snapshot is a replacement, not an append: removed votes must disappear.
  await prisma.$transaction(async (tx) => {
    await tx.vote.deleteMany({ where: { refIndex } });
    if (snapshot.length > 0) await tx.vote.createMany({ data: snapshot });
  });
  return snapshot.length;
}

export async function recordTallySnapshot(
  api: ApiPromise,
  refIndex: number,
  atBlock: number,
): Promise<void> {
  const info = await api.query.referenda.referendumInfoFor(refIndex);
  const ref = parseReferendumInfo(refIndex, info);
  if (!ref?.tally) return;
  await prisma.tallySnapshot.upsert({
    where: { refIndex_atBlock: { refIndex, atBlock } },
    create: {
      refIndex,
      atBlock,
      ayes: ref.tally.ayes.toString(),
      nays: ref.tally.nays.toString(),
      support: ref.tally.support.toString(),
    },
    update: {},
  });
}

// Handle a terminal event: store the final tally from the event payload and
// snapshot the voter list from the parent block's state (still intact there).
export async function handleTerminal(
  api: ApiPromise,
  index: number,
  phase: Phase,
  tally: { ayes: string; nays: string; support: string } | null,
  blockNumber: number,
): Promise<void> {
  // Parent-block state still holds the Ongoing variant: track, proposer, votes.
  const parentHash = (await api.rpc.chain.getBlockHash(blockNumber - 1)).toHex();
  const apiAt: any = await api.at(parentHash);
  const info = await apiAt.query.referenda.referendumInfoFor(index);
  const before = parseReferendumInfo(index, info);

  await prisma.referendum.upsert({
    where: { index },
    create: {
      index,
      trackId: before?.trackId,
      proposer: before?.proposer,
      proposalHash: before?.proposalHash,
      proposalLen: before?.proposalLen,
      submittedAt: before?.submittedAt,
      decidingSince: before?.decidingSince,
      status: phase,
      decidedAt: blockNumber,
      finalTally: tally ?? undefined,
    },
    update: {
      trackId: before?.trackId ?? undefined,
      proposer: before?.proposer ?? undefined,
      proposalHash: before?.proposalHash ?? undefined,
      proposalLen: before?.proposalLen ?? undefined,
      submittedAt: before?.submittedAt ?? undefined,
      decidingSince: before?.decidingSince ?? undefined,
      status: phase,
      decidedAt: blockNumber,
      finalTally: tally ?? undefined,
    },
  });

  if (before?.trackId !== null && before?.trackId !== undefined) {
    await snapshotVotes(apiAt, index, before.trackId, blockNumber - 1);
  }
}
