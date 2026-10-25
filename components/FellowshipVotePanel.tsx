"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Vote } from "lucide-react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Seal } from "@/components/Seal";
import { useApi } from "@/lib/chain/ApiProvider";
import { humanizeReadError } from "@/lib/chain/errors";
import { useFellowshipVotingState } from "@/lib/chain/fellowship-voting";
import type { Referendum } from "@/lib/chain/referenda";
import { ONGOING_PHASES } from "@/lib/chain/referenda";
import { isTxPending, TX_LABEL, useSendTx } from "@/lib/chain/tx";
import { useWallet } from "@/lib/chain/wallet";

export function FellowshipVotePanel({ referendum }: { referendum: Referendum }) {
  const { api, connected, error: apiError } = useApi();
  const { account } = useWallet();
  const queryClient = useQueryClient();
  const { status, send } = useSendTx();
  const {
    data: votingState,
    isPending: votingStatePending,
    error: votingStateError,
    refetch: refetchVotingState,
  } = useFellowshipVotingState(account?.address, referendum.index);

  const minimumRank = referendum.trackId;
  const ongoing = ONGOING_PHASES.includes(referendum.phase);
  const transactionPending = isTxPending(status);
  const eligibilityReason = !account
    ? "Connect and select a Fellowship account to vote."
    : !api || !connected
      ? apiError ?? "Connecting to Vara Network…"
      : votingStatePending
        ? "Checking Fellowship membership…"
        : votingStateError
          ? "Fellowship membership is unavailable."
          : votingState?.rank === null || votingState?.rank === undefined
            ? "This account is not a Fellowship member."
            : minimumRank === null
              ? "The required Fellowship rank is unavailable."
              : votingState.rank < minimumRank
                ? `This proposal requires rank ${minimumRank} or higher. Your rank is ${votingState.rank}.`
                : !ongoing
                  ? "Voting has ended for this referendum."
                  : null;

  async function submit(aye: boolean) {
    if (!api || eligibilityReason || transactionPending) return;
    const ok = await send(api.tx.fellowshipCollective.vote(referendum.index, aye));
    if (!ok) return;

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["fellowshipVotingState", account?.address, referendum.index],
      }),
      queryClient.invalidateQueries({
        queryKey: ["fellowshipReferendum", referendum.index],
      }),
      queryClient.invalidateQueries({ queryKey: ["fellowshipReferenda"] }),
    ]);
  }

  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <Vote size={16} className="text-accent-ink" aria-hidden="true" />
        <h2 className="label-serif">Fellowship vote</h2>
      </div>

      {votingStateError && account && (
        <div className="mb-3">
          <ErrorNotice
            message={humanizeReadError("your Fellowship membership and vote")}
            onRetry={() => void refetchVotingState()}
            compact
          />
        </div>
      )}

      {votingState?.rank !== null && votingState?.rank !== undefined && (
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="text-muted">Your rank</span>
          <span className="tnum font-medium">{votingState.rank}</span>
        </div>
      )}

      {votingState?.vote && (
        <div
          className={`mb-3 rounded-[10px] px-3 py-2 text-sm ${
            votingState.vote.aye ? "bg-aye/10 text-aye" : "bg-nay/10 text-nay"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 font-medium">
              <Check size={14} aria-hidden="true" />
              Current vote: {votingState.vote.aye ? "Aye" : "Nay"}
            </span>
            <span className="tnum text-xs">weight {votingState.vote.weight}</span>
          </div>
        </div>
      )}

      {eligibilityReason && !votingStateError && (
        <p className="mb-3 text-xs text-muted">{eligibilityReason}</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void submit(true)}
          disabled={!!eligibilityReason || transactionPending}
          className="btn bg-aye/12 text-aye hover:bg-aye/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {transactionPending ? TX_LABEL[status.state] : "Vote Aye"}
        </button>
        <button
          type="button"
          onClick={() => void submit(false)}
          disabled={!!eligibilityReason || transactionPending}
          className="btn bg-nay/12 text-nay hover:bg-nay/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {transactionPending ? TX_LABEL[status.state] : "Vote Nay"}
        </button>
      </div>

      {status.state === "error" && (
        <div className="mt-3">
          <ErrorNotice message={status.message} compact />
        </div>
      )}
      {(status.state === "inBlock" || status.state === "finalized") && (
        <div className="mt-3 flex items-center gap-2 text-xs text-aye">
          {status.state === "finalized" && <Seal size={32} />}
          <span>
            Vote {status.state === "finalized" ? "finalized — sealed on chain" : "in block"}
          </span>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Fellowship votes are weighted by rank. Casting the opposite vote changes your
        existing vote.
      </p>
    </section>
  );
}
