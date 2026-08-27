"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Seal } from "./Seal";
import BigNumber from "bignumber.js";
import { BN } from "@polkadot/util";
import { useApi } from "@/lib/chain/ApiProvider";
import { useWallet } from "@/lib/chain/wallet";
import { useSendTx, TX_LABEL } from "@/lib/chain/tx";
import { CONVICTIONS, useMyVote, useVotingBalance } from "@/lib/chain/voting";
import { DECIMALS, formatVara, shortAddress } from "@/lib/chain/format";
import type { Referendum } from "@/lib/chain/referenda";

const TABS = ["Aye", "Nay", "Abstain"] as const;
type Tab = (typeof TABS)[number];

export function VotePopup({
  referendum,
  onClose,
}: {
  referendum: Referendum;
  onClose: () => void;
}) {
  const { api } = useApi();
  const { account } = useWallet();
  const queryClient = useQueryClient();
  const { status, send, reset } = useSendTx();

  const [tab, setTab] = useState<Tab>("Aye");
  const [amount, setAmount] = useState("");
  const [conviction, setConviction] = useState(1);

  const { data: myVote } = useMyVote(
    account?.address,
    referendum.trackId,
    referendum.index,
  );
  const balance = useVotingBalance(account?.address);

  const planck = useMemo(() => {
    const v = new BigNumber(amount || "0");
    if (v.isNaN() || v.lte(0)) return null;
    return new BN(
      v.times(new BigNumber(10).pow(DECIMALS)).toFixed(0, BigNumber.ROUND_DOWN),
    );
  }, [amount]);

  const amountTooHigh = planck !== null && balance !== undefined && planck.gt(balance);

  // Every disabled state names its reason (wallet-readiness rule).
  const disabledReason = !account
    ? "Connect a wallet first"
    : myVote?.kind === "delegating"
      ? "You delegate votes on this track"
      : planck === null
        ? "Enter an amount"
        : amountTooHigh
          ? "Amount exceeds your balance"
          : status.state === "signing" || status.state === "broadcast"
            ? TX_LABEL[status.state]
            : null;

  const lockDays = tab === "Abstain" ? 0 : CONVICTIONS[conviction].lockPeriods * 7;

  async function submit() {
    if (!api || planck === null || disabledReason) return;
    const voteArg =
      tab === "Abstain"
        ? { SplitAbstain: { aye: 0, nay: 0, abstain: planck } }
        : {
            Standard: {
              vote: { aye: tab === "Aye", conviction },
              balance: planck,
            },
          };
    const ok = await send(
      api.tx.convictionVoting.vote(referendum.index, voteArg),
    );
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: ["myVote"] });
      await queryClient.invalidateQueries({
        queryKey: ["referendum", referendum.index],
      });
    }
  }

  async function removeVote() {
    if (!api || referendum.trackId === null) return;
    const ok = await send(
      api.tx.convictionVoting.removeVote(referendum.trackId, referendum.index),
    );
    if (ok) await queryClient.invalidateQueries({ queryKey: ["myVote"] });
  }

  return (
    <div
      className="overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Vote on referendum #${referendum.index}`}
    >
      <div
        className="modal anim-pop w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold tracking-tight">
            Vote · <span className="tnum">#{referendum.index}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn btn-ghost h-8 w-8 !p-0 text-muted"
          >
            <X size={15} />
          </button>
        </div>

        {myVote?.kind === "delegating" ? (
          <p className="text-sm text-muted">
            This account delegates its votes on this track to{" "}
            <span className="tnum">{shortAddress(myVote.target)}</span>. Undelegate
            first to vote directly (delegation management comes in v2).
          </p>
        ) : (
          <>
            {myVote && myVote.kind !== "none" && (
              <div className="mb-4 flex items-center justify-between rounded-[10px] bg-surface-2 px-3 py-2 text-sm">
                <span className="text-muted">
                  Current vote:{" "}
                  {myVote.kind === "standard"
                    ? `${myVote.aye ? "Aye" : "Nay"} · ${formatVara(myVote.balance)} VARA · ${CONVICTIONS[myVote.conviction]?.label ?? ""}`
                    : myVote.kind}
                </span>
                <button
                  onClick={() => void removeVote()}
                  className="font-medium text-nay hover:underline"
                >
                  Remove
                </button>
              </div>
            )}

            <div
              role="tablist"
              aria-label="Vote direction"
              className="mb-4 flex rounded-[10px] border border-line p-0.5"
            >
              {TABS.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => {
                    setTab(t);
                    reset();
                  }}
                  className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors duration-150 ${
                    tab === t
                      ? t === "Aye"
                        ? "bg-aye/12 text-aye"
                        : t === "Nay"
                          ? "bg-nay/12 text-nay"
                          : "bg-surface-2 text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-xs text-muted" htmlFor="vote-amount">
              Amount (VARA)
              {balance !== undefined && (
                <button
                  className="tnum float-right font-medium text-accent-ink hover:underline"
                  onClick={() =>
                    setAmount(
                      new BigNumber(balance.toString())
                        .div(new BigNumber(10).pow(DECIMALS))
                        .toFixed(2, BigNumber.ROUND_DOWN),
                    )
                  }
                >
                  max {formatVara(balance)}
                </button>
              )}
            </label>
            <input
              id="vote-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", "."))}
              placeholder="0.0"
              className={`input tnum mb-4 ${amountTooHigh ? "!border-nay" : ""}`}
            />

            {tab !== "Abstain" && (
              <div className="mb-4">
                <label className="mb-1 block text-xs text-muted" htmlFor="conviction">
                  Conviction ·{" "}
                  <span className="font-medium text-ink">
                    {CONVICTIONS[conviction].label}
                  </span>
                  {lockDays > 0
                    ? ` · locks tokens for ${lockDays} days after the referendum ends`
                    : " · no lock"}
                </label>
                <input
                  id="conviction"
                  type="range"
                  min={0}
                  max={6}
                  value={conviction}
                  onChange={(e) => setConviction(Number(e.target.value))}
                  className="w-full accent-(--accent)"
                />
                {planck !== null && (
                  <p className="tnum mt-1 text-xs text-muted">
                    ={" "}
                    <span className="font-medium text-ink">
                      {formatVara(
                        conviction === 0 ? planck.divn(10) : planck.muln(conviction),
                      )}
                    </span>{" "}
                    votes
                  </p>
                )}
              </div>
            )}

            {status.state === "error" && (
              <p className="mb-3 text-sm text-nay">{status.message}</p>
            )}
            {(status.state === "inBlock" || status.state === "finalized") && (
              <div className="mb-3 flex items-center gap-3">
                {status.state === "finalized" && <Seal size={40} />}
                <p className="text-sm text-aye">
                  Vote {status.state === "finalized" ? "finalized — sealed on chain" : "in block"}
                </p>
              </div>
            )}

            <button
              onClick={() => void submit()}
              disabled={!!disabledReason}
              className={`btn w-full ${
                tab === "Nay" && !disabledReason
                  ? "bg-nay text-white hover:opacity-90"
                  : "btn-primary"
              }`}
            >
              {disabledReason ??
                (status.state === "idle" || status.state === "error"
                  ? `Vote ${tab}`
                  : TX_LABEL[status.state])}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
