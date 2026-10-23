/* eslint-disable @typescript-eslint/no-explicit-any */

export type DirectVote = {
  voter: string;
  kind: string;
  aye: string | null;
  nay: string | null;
  abstain: string | null;
  conviction: number | null;
};

export type ParsedDirectVote = Omit<DirectVote, "voter">;

export function parseDirectVote(vote: any): ParsedDirectVote | null {
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

export function directVoteCapital(vote: ParsedDirectVote): bigint {
  return (
    BigInt(vote.aye ?? 0) +
    BigInt(vote.nay ?? 0) +
    BigInt(vote.abstain ?? 0)
  );
}

