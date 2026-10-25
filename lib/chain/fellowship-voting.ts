"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "./ApiProvider";

export type FellowshipVote = {
  aye: boolean;
  weight: number;
};

export type FellowshipVotingState = {
  rank: number | null;
  vote: FellowshipVote | null;
};

type CodecNumberLike =
  | number
  | string
  | bigint
  | {
      toNumber?: () => number;
    };

type OptionLike<T> = {
  isNone: boolean;
  unwrap: () => T | null;
};

type FellowshipMemberCodec = { rank: CodecNumberLike };
type FellowshipVoteCodec = {
  isAye: boolean;
  isNay: boolean;
  asAye?: CodecNumberLike;
  asNay?: CodecNumberLike;
};

function codecNumber(value: CodecNumberLike): number {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof value.toNumber === "function"
  ) {
    return value.toNumber();
  }
  return Number(String(value));
}

export function parseFellowshipMemberRank(
  member: OptionLike<FellowshipMemberCodec>,
): number | null {
  if (member.isNone) return null;
  const value = member.unwrap();
  return value ? codecNumber(value.rank) : null;
}

export function parseFellowshipVote(
  voting: OptionLike<FellowshipVoteCodec>,
): FellowshipVote | null {
  if (voting.isNone) return null;
  const vote = voting.unwrap();
  if (!vote) return null;
  if (vote.isAye && vote.asAye !== undefined) {
    return { aye: true, weight: codecNumber(vote.asAye) };
  }
  if (vote.isNay && vote.asNay !== undefined) {
    return { aye: false, weight: codecNumber(vote.asNay) };
  }
  return null;
}

export function useFellowshipVotingState(
  address: string | undefined,
  referendumIndex: number,
) {
  const { api } = useApi();

  return useQuery({
    queryKey: ["fellowshipVotingState", address, referendumIndex],
    queryFn: async (): Promise<FellowshipVotingState> => {
      const [member, voting] = await Promise.all([
        api!.query.fellowshipCollective.members(address!),
        api!.query.fellowshipCollective.voting(referendumIndex, address!),
      ]);
      return {
        rank: parseFellowshipMemberRank(
          member as unknown as OptionLike<FellowshipMemberCodec>,
        ),
        vote: parseFellowshipVote(
          voting as unknown as OptionLike<FellowshipVoteCodec>,
        ),
      };
    },
    enabled: !!api && !!address && Number.isInteger(referendumIndex),
    refetchInterval: 6_000,
  });
}
