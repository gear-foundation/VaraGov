"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Seal } from "./Seal";
import BigNumber from "bignumber.js";
import { BN } from "@polkadot/util";
import { useApi } from "@/lib/chain/ApiProvider";
import { useWallet } from "@/lib/chain/wallet";
import { isTxPending, useSendTx, TX_LABEL } from "@/lib/chain/tx";
import {
  CONVICTIONS,
  useMyVote,
  useVotingBalanceQuery,
} from "@/lib/chain/voting";
import { safeMaximumVoteBalance } from "@/lib/chain/vote-limits";
import { parseVaraAmount } from "@/lib/chain/amount";
import { humanizeTxError } from "@/lib/chain/errors";
import { humanizeReadError } from "@/lib/chain/errors";
import { ErrorNotice } from "@/components/ErrorNotice";
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
  const { api, connected, error: apiError } = useApi();
  const { account } = useWallet();
  const queryClient = useQueryClient();
  const { status, send, reset } = useSendTx();

  const [tab, setTab] = useState<Tab>("Aye");
  const [amount, setAmount] = useState("");
  const [conviction, setConviction] = useState(1);
  const [maxBusy, setMaxBusy] = useState(false);
  const [maxError, setMaxError] = useState<string | null>(null);

  const {
    data: myVote,
    isPending: votePending,
    error: voteError,
    refetch: refetchVote,
  } = useMyVote(
    account?.address,
    referendum.trackId,
    referendum.index,
  );
  const {
    data: balance,
    isPending: balancePending,
    error: balanceError,
    refetch: refetchBalance,
  } = useVotingBalanceQuery(account?.address);

  const parsedAmount = useMemo(() => parseVaraAmount(amount), [amount]);
  const planck = parsedAmount.ok ? parsedAmount.planck : null;

  const amountTooHigh = planck !== null && balance !== undefined && planck.gt(balance);
  const transactionPending = isTxPending(status);
  const transactionFinalized = status.state === "finalized";
  const transactionLocked = transactionPending || transactionFinalized;

  // Every disabled state names its reason (wallet-readiness rule).
  const disabledReason = !account
    ? "Connect a wallet first"
    : !api || !connected
      ? apiError
        ? "Vara Network is unavailable"
        : "Connecting to Vara Network…"
      : referendum.trackId === null
        ? "The governance track is unavailable"
        : votePending
          ? "Loading your voting state…"
          : voteError
            ? "Your voting state is unavailable"
            : balancePending
              ? "Loading your balance…"
              : balanceError || balance === undefined
                ? "Your balance is unavailable"
                : myVote?.kind === "delegating"
                  ? "You delegate votes on this track"
                  : !parsedAmount.ok
                    ? parsedAmount.message
                    : amountTooHigh
                      ? "Amount exceeds your balance"
                      : transactionPending
                        ? TX_LABEL[status.state]
                        : null;

  const lockDays = tab === "Abstain" ? 0 : CONVICTIONS[conviction].lockPeriods * 7;

  function voteArgument(voteBalance: BN) {
    return tab === "Abstain"
      ? { SplitAbstain: { aye: 0, nay: 0, abstain: voteBalance } }
      : {
          Standard: {
            vote: { aye: tab === "Aye", conviction },
            balance: voteBalance,
          },
        };
  }

  async function setSafeMaximumAmount() {
    if (!api || !connected || !account || !balance) return;
    setMaxBusy(true);
    setMaxError(null);
    reset();
    try {
      const tx = api.tx.convictionVoting.vote(
        referendum.index,
        voteArgument(balance),
      );
      const [accountInfo, paymentInfo] = await Promise.all([
        api.query.system.account(account.address),
        tx.paymentInfo(account.address),
      ]);
      const maximum = safeMaximumVoteBalance(
        accountInfo.data.free.toBn(),
        accountInfo.data.frozen.toBn(),
        api.consts.balances.existentialDeposit.toBn(),
        paymentInfo.partialFee.toBn(),
      );
      if (!maximum.ok) {
        setMaxError(maximum.message);
        return;
      }
      setAmount(
        new BigNumber(maximum.balance.toString())
          .div(new BigNumber(10).pow(DECIMALS))
          .toFixed(DECIMALS, BigNumber.ROUND_DOWN)
          .replace(/\.?0+$/, ""),
      );
    } catch (error) {
      setMaxError(humanizeTxError(error));
    } finally {
      setMaxBusy(false);
    }
  }

  async function submit() {
    if (!api || planck === null || disabledReason) return;
    const voteArg = voteArgument(planck);
    const ok = await send(
      api.tx.convictionVoting.vote(referendum.index, voteArg),
    );
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: ["myVote"] });
      await queryClient.invalidateQueries({
        queryKey: ["referendumVotes", referendum.index],
      });
      await queryClient.invalidateQueries({
        queryKey: ["referendum", referendum.index],
      });
    }
  }

  async function removeVote() {
    if (!api || !connected || referendum.trackId === null) return;
    const ok = await send(
      api.tx.convictionVoting.removeVote(referendum.trackId, referendum.index),
    );
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: ["myVote"] });
      await queryClient.invalidateQueries({
        queryKey: ["referendumVotes", referendum.index],
      });
      await queryClient.invalidateQueries({
        queryKey: ["referendum", referendum.index],
      });
    }
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
            {voteError && (
              <div className="mb-3">
                <ErrorNotice
                  message={humanizeReadError("your current voting state")}
                  onRetry={() => void refetchVote()}
                  compact
                />
              </div>
            )}
            {balanceError && (
              <div className="mb-3">
                <ErrorNotice
                  message={humanizeReadError("your account balance")}
                  onRetry={() => void refetchBalance()}
                  compact
                />
              </div>
            )}
            {apiError && !connected && (
              <div className="mb-3">
                <ErrorNotice message={apiError} compact />
              </div>
            )}
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
                  disabled={transactionLocked || !connected}
                  title={!connected ? "Vara Network is unavailable" : undefined}
                  className="font-medium text-nay hover:underline disabled:cursor-not-allowed disabled:opacity-50"
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
                  disabled={transactionLocked}
                  onClick={() => {
                    setTab(t);
                    setMaxError(null);
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
                  disabled={transactionLocked || maxBusy || !connected}
                  title={!connected ? "Vara Network is unavailable" : undefined}
                  onClick={() => void setSafeMaximumAmount()}
                >
                  {maxBusy ? "checking fee…" : `max ${formatVara(balance)}`}
                </button>
              )}
            </label>
            <input
              id="vote-amount"
              inputMode="decimal"
              value={amount}
              disabled={transactionLocked}
              onChange={(e) => {
                setAmount(e.target.value.replace(",", "."));
                setMaxError(null);
              }}
              placeholder="0.0"
              className={`input tnum mb-4 ${
                amount.trim() && (!parsedAmount.ok || amountTooHigh) ? "!border-nay" : ""
              }`}
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
                  disabled={transactionLocked}
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
              <div className="mb-3">
                <ErrorNotice message={status.message} compact />
              </div>
            )}
            {maxError && status.state !== "error" && (
              <div className="mb-3">
                <ErrorNotice message={maxError} compact />
              </div>
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
              onClick={transactionFinalized ? onClose : () => void submit()}
              disabled={!transactionFinalized && !!disabledReason}
              className={`btn w-full ${
                tab === "Nay" && !disabledReason && !transactionFinalized
                  ? "bg-nay text-white hover:opacity-90"
                  : "btn-primary"
              }`}
            >
              {transactionFinalized
                ? "Done"
                : disabledReason ??
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
