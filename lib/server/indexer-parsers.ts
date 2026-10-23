/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  parseDirectVote,
  type DirectVote,
} from "../chain/direct-votes";

export type SnapshotVote = DirectVote & {
  refIndex: number;
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
  return parseDirectVote(vote);
}
