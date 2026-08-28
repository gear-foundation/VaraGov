/* eslint-disable @typescript-eslint/no-explicit-any */

export type SnapshotVote = {
  refIndex: number;
  voter: string;
  kind: string;
  aye: string | null;
  nay: string | null;
  abstain: string | null;
  conviction: number | null;
  atBlock: number;
};

export function tallyFromEvent(eventData: any): {
  ayes: string;
  nays: string;
  support: string;
} | null {
  const tally = eventData[1];
  if (!tally || tally.ayes === undefined) return null;
  return {
    ayes: tally.ayes.toString(),
    nays: tally.nays.toString(),
    support: tally.support.toString(),
  };
}

export function parseSnapshotVote(
  vote: any,
): Omit<SnapshotVote, "refIndex" | "voter" | "atBlock"> | null {
  if (vote.isStandard) {
    const standard = vote.asStandard;
    const balance = standard.balance.toString();
    return {
      kind: "standard",
      aye: standard.vote.isAye ? balance : null,
      nay: standard.vote.isAye ? null : balance,
      abstain: null,
      conviction: standard.vote.conviction.index,
    };
  }
  if (vote.isSplit) {
    return {
      kind: "split",
      aye: vote.asSplit.aye.toString(),
      nay: vote.asSplit.nay.toString(),
      abstain: null,
      conviction: null,
    };
  }
  if (vote.isSplitAbstain) {
    return {
      kind: "splitAbstain",
      aye: vote.asSplitAbstain.aye.toString(),
      nay: vote.asSplitAbstain.nay.toString(),
      abstain: vote.asSplitAbstain.abstain.toString(),
      conviction: null,
    };
  }
  return null;
}
