"use client";

import { useQuery } from "@tanstack/react-query";
import { BN, BN_ZERO } from "@polkadot/util";
import { useApi } from "./ApiProvider";

export const CONVICTIONS = [
  { value: 0, label: "0.1x", lockPeriods: 0 },
  { value: 1, label: "1x", lockPeriods: 1 },
  { value: 2, label: "2x", lockPeriods: 2 },
  { value: 3, label: "3x", lockPeriods: 4 },
  { value: 4, label: "4x", lockPeriods: 8 },
  { value: 5, label: "5x", lockPeriods: 16 },
  { value: 6, label: "6x", lockPeriods: 32 },
] as const;

export type MyVote =
  | { kind: "none" }
  | { kind: "delegating"; target: string }
  | {
      kind: "standard";
      aye: boolean;
      balance: BN;
      conviction: number;
    }
  | { kind: "split"; ayeAmount: BN; nayAmount: BN }
  | { kind: "splitAbstain"; ayeAmount: BN; nayAmount: BN; abstainAmount: BN };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseAccountVote(voting: any, refIndex: number): MyVote {
  if (voting.isDelegating) {
    return { kind: "delegating", target: voting.asDelegating.target.toString() };
  }
  if (voting.isCasting) {
    const entry = voting.asCasting.votes.find(
      ([idx]: [any, any]) => idx.toNumber() === refIndex,
    );
    if (!entry) return { kind: "none" };
    const vote = entry[1];
    if (vote.isStandard) {
      const s = vote.asStandard;
      return {
        kind: "standard",
        aye: s.vote.isAye,
        balance: s.balance.toBn(),
        conviction: s.vote.conviction.index,
      };
    }
    if (vote.isSplit) {
      return {
        kind: "split",
        ayeAmount: vote.asSplit.aye.toBn(),
        nayAmount: vote.asSplit.nay.toBn(),
      };
    }
    if (vote.isSplitAbstain) {
      const sa = vote.asSplitAbstain;
      return {
        kind: "splitAbstain",
        ayeAmount: sa.aye.toBn(),
        nayAmount: sa.nay.toBn(),
        abstainAmount: sa.abstain.toBn(),
      };
    }
  }
  return { kind: "none" };
}

export function useMyVote(
  address: string | undefined,
  trackId: number | null,
  refIndex: number,
) {
  const { api } = useApi();
  return useQuery({
    queryKey: ["myVote", address, trackId, refIndex],
    queryFn: async () => {
      const voting = await api!.query.convictionVoting.votingFor(
        address!,
        trackId!,
      );
      return parseAccountVote(voting, refIndex);
    },
    enabled: !!api && !!address && trackId !== null,
    refetchInterval: 12_000,
  });
}

export function useVotingBalance(address: string | undefined): BN | undefined {
  const { api } = useApi();
  const { data } = useQuery({
    queryKey: ["balance", address],
    queryFn: async () => {
      const account: any = await api!.query.system.account(address!);
      // Locked tokens can still vote; frozen doesn't reduce what vote() accepts.
      return account.data.free.toBn() as BN;
    },
    enabled: !!api && !!address,
    refetchInterval: 30_000,
  });
  return data ?? (address ? undefined : BN_ZERO);
}
