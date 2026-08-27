"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/chain/ApiProvider";
import { useWallet } from "@/lib/chain/wallet";
import { useSendTx, TX_LABEL } from "@/lib/chain/tx";
import { useTracks } from "@/lib/chain/hooks";
import { CONVICTIONS } from "@/lib/chain/voting";
import { formatVara, shortAddress } from "@/lib/chain/format";
import type { BN } from "@polkadot/util";
import { Skeleton } from "@/components/referenda";

type VoteRow = {
  trackId: number;
  refIndex: number;
  label: string;
  balance: BN;
};
type TrackState = {
  trackId: number;
  delegating: { target: string; balance: BN } | null;
  priorUnlockAt: number | null; // block when the prior lock expires
  priorBalance: BN | null;
  votes: VoteRow[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseTrackVoting(trackId: number, voting: any): TrackState {
  const state: TrackState = {
    trackId,
    delegating: null,
    priorUnlockAt: null,
    priorBalance: null,
    votes: [],
  };
  const src = voting.isCasting ? voting.asCasting : voting.isDelegating ? voting.asDelegating : null;
  if (!src) return state;
  if (voting.isDelegating) {
    state.delegating = {
      target: src.target.toString(),
      balance: src.balance.toBn(),
    };
  } else {
    for (const [idx, vote] of src.votes) {
      let label = "vote";
      let balance = null as BN | null;
      if (vote.isStandard) {
        const s = vote.asStandard;
        label = `${s.vote.isAye ? "Aye" : "Nay"} · ${CONVICTIONS[s.vote.conviction.index]?.label ?? ""}`;
        balance = s.balance.toBn();
      } else if (vote.isSplit) {
        label = "Split";
        balance = vote.asSplit.aye.toBn().add(vote.asSplit.nay.toBn());
      } else if (vote.isSplitAbstain) {
        label = "Abstain";
        const sa = vote.asSplitAbstain;
        balance = sa.aye.toBn().add(sa.nay.toBn()).add(sa.abstain.toBn());
      }
      state.votes.push({
        trackId,
        refIndex: idx.toNumber(),
        label,
        balance: balance!,
      });
    }
  }
  const prior = src.prior;
  if (prior && !prior[1].toBn().isZero()) {
    state.priorUnlockAt = prior[0].toNumber();
    state.priorBalance = prior[1].toBn();
  }
  return state;
}

export default function MyVotesPage() {
  const { api, finalizedNumber } = useApi();
  const { account, status: walletStatus, connect } = useWallet();
  const tracks = useTracks();
  const queryClient = useQueryClient();
  const { status, send } = useSendTx();

  const { data: states, isPending } = useQuery({
    queryKey: ["myVotes", account?.address],
    queryFn: async () => {
      const results = await Promise.all(
        tracks!.map(async (t) => {
          const voting = await api!.query.convictionVoting.votingFor(
            account!.address,
            t.id,
          );
          return parseTrackVoting(t.id, voting);
        }),
      );
      return results.filter(
        (s) => s.votes.length > 0 || s.delegating || s.priorBalance,
      );
    },
    enabled: !!api && !!account && !!tracks,
    refetchInterval: 30_000,
  });

  if (!account) {
    return (
      <div className="panel anim-rise p-10 text-center">
        <p className="text-muted">Connect a wallet to see your votes.</p>
        {walletStatus === "no-extension" && (
          <p className="mt-2 text-sm text-muted">
            No wallet extension found — install SubWallet, Talisman or polkadot.js.
          </p>
        )}
        <button
          onClick={() => void connect()}
          className="btn btn-soft mt-4"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  const busy = status.state === "signing" || status.state === "broadcast";
  const trackName = (id: number) =>
    tracks?.find((t) => t.id === id)?.displayName ?? `Track ${id}`;

  async function remove(row: VoteRow) {
    const ok = await send(
      api!.tx.convictionVoting.removeVote(row.trackId, row.refIndex),
    );
    if (ok) await queryClient.invalidateQueries({ queryKey: ["myVotes"] });
  }

  async function unlock(trackId: number) {
    const ok = await send(
      api!.tx.convictionVoting.unlock(trackId, account!.address),
    );
    if (ok) await queryClient.invalidateQueries({ queryKey: ["myVotes"] });
  }

  return (
    <div>
      <h1 className="display anim-rise text-[34px] font-semibold">My votes</h1>
      <p className="mt-1 text-sm text-muted">
        {account.meta.name || shortAddress(account.address)} ·{" "}
        <span className="tnum">{shortAddress(account.address)}</span>
      </p>

      {status.state === "error" && (
        <p className="mt-3 text-sm text-nay">{status.message}</p>
      )}
      {busy && <p className="mt-3 text-sm text-muted">{TX_LABEL[status.state]}</p>}

      {isPending ? (
        <div className="mt-6">
          <Skeleton rows={3} />
        </div>
      ) : !states || states.length === 0 ? (
        <div className="panel mt-6 p-10 text-center text-sm text-muted">
          No votes, delegations or locks on any track.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {states.map((s) => (
            <section
              key={s.trackId}
              className="panel anim-rise p-4"
            >
              <h2 className="label-serif mb-2">
                {trackName(s.trackId)}
              </h2>
              {s.delegating && (
                <p className="text-sm text-muted">
                  Delegating {formatVara(s.delegating.balance)} VARA to{" "}
                  <span className="tnum">{shortAddress(s.delegating.target)}</span>
                </p>
              )}
              {s.votes.map((row) => (
                <div
                  key={row.refIndex}
                  className="flex items-center justify-between border-t border-line py-2 text-sm first:border-t-0"
                >
                  <Link
                    href={`/referenda/${row.refIndex}`}
                    className="hover:text-accent-ink"
                  >
                    Referendum #{row.refIndex}
                  </Link>
                  <span className="tnum text-muted">
                    {row.label} · {formatVara(row.balance)} VARA
                  </span>
                  <button
                    onClick={() => void remove(row)}
                    disabled={busy}
                    className="text-nay hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {s.priorBalance && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <span className="text-muted">
                    Lock: {formatVara(s.priorBalance)} VARA
                    {s.priorUnlockAt !== null && finalizedNumber !== null && (
                      <>
                        {" "}
                        {s.priorUnlockAt <= finalizedNumber
                          ? "(expired)"
                          : `until block #${s.priorUnlockAt.toLocaleString("en-US")}`}
                      </>
                    )}
                  </span>
                  <button
                    onClick={() => void unlock(s.trackId)}
                    disabled={
                      busy ||
                      (s.priorUnlockAt !== null &&
                        finalizedNumber !== null &&
                        s.priorUnlockAt > finalizedNumber)
                    }
                    title={
                      s.priorUnlockAt !== null &&
                      finalizedNumber !== null &&
                      s.priorUnlockAt > finalizedNumber
                        ? "Lock has not expired yet"
                        : undefined
                    }
                    className="text-accent-ink hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Unlock
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
