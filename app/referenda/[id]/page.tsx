"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { hexToString, isHex } from "@polkadot/util";
import { ArrowLeft, FilePenLine } from "lucide-react";
import { useApi } from "@/lib/chain/ApiProvider";
import { useWallet } from "@/lib/chain/wallet";
import { isTxPending, useSendTx, TX_LABEL } from "@/lib/chain/tx";
import { VotePopup } from "@/components/VotePopup";
import { EditContent } from "@/components/EditContent";
import { Comments } from "@/components/Comments";
import {
  HistoryPanel,
  TallyPanel,
  VoteStatistics,
  useHistory,
} from "@/components/HistoryPanel";
import { Markdown } from "@/components/Markdown";
import { useContent } from "@/lib/content";
import {
  useActiveIssuance,
  useReferendum,
  useTracks,
} from "@/lib/chain/hooks";
import {
  approvalFraction,
  supportFraction,
} from "@/lib/chain/curves";
import {
  blocksToDuration,
  formatVara,
} from "@/lib/chain/format";
import { referendumOutlook } from "@/lib/chain/referendum-outlook";
import { ONGOING_PHASES } from "@/lib/chain/referenda";
import { PHASE_LABEL, StatusPill, TrackBadge } from "@/components/referenda";
import { CurveChart } from "@/components/CurveChart";
import { ReferendumTreasury } from "@/components/ReferendumTreasury";
import { useTokenProposal } from "@/lib/chain/proposal-hooks";
import { requiredSupport } from "@/lib/chain/treasury";
import { ExplorerAccount } from "@/components/TreasuryValues";
import type { DecodedCallNode } from "@/lib/chain/call-decoder";
import { sameAccount } from "@/lib/chain/address";
import { ErrorNotice } from "@/components/ErrorNotice";
import { humanizeReadError } from "@/lib/chain/errors";
import { useReferendumVotes } from "@/lib/chain/voting";

function DecisionDepositButton({ refIndex }: { refIndex: number }) {
  const { api, connected } = useApi();
  const { account } = useWallet();
  const { status, send } = useSendTx();
  const queryClient = useQueryClient();
  const busy = isTxPending(status);
  return (
    <div className="mt-2">
      <button
        disabled={!account || !api || !connected || busy}
        onClick={async () => {
          const ok = await send(api!.tx.referenda.placeDecisionDeposit(refIndex));
          if (ok)
            await queryClient.invalidateQueries({ queryKey: ["referendum", refIndex] });
        }}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
          !account || !api || !connected || busy
            ? "cursor-not-allowed bg-surface-2 text-muted"
            : "bg-warn/20 text-warn hover:opacity-90"
        }`}
      >
        {busy
          ? TX_LABEL[status.state]
          : !account
            ? "Connect a wallet to place the deposit"
            : !api || !connected
              ? "Vara Network is unavailable"
              : "Place decision deposit"}
      </button>
      {status.state === "error" && (
        <p className="mt-1 text-xs text-nay">{status.message}</p>
      )}
      {status.state === "finalized" && (
        <p className="mt-1 text-xs text-aye">Deposit placed ✓</p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="tnum text-right">{children}</span>
    </div>
  );
}

function readableRemark(call: DecodedCallNode | null | undefined) {
  if (call?.section !== "system" || call.method !== "remark") return null;
  const value = call.args.find((arg) => arg.name === "remark")?.value;
  if (typeof value !== "string" || !value) return null;
  if (!isHex(value)) return value;

  try {
    const decoded = hexToString(value);
    return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(decoded)
      ? value
      : decoded;
  } catch {
    return value;
  }
}

export default function ReferendumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const index = Number(id);
  const [voteOpen, setVoteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { account } = useWallet();
  const {
    data: content,
    error: contentError,
    refetch: refetchContent,
  } = useContent(index);
  const {
    data: ref,
    isPending,
    error,
    refetch,
  } = useReferendum(index);
  const {
    data: history,
    error: historyError,
    refetch: refetchHistory,
  } = useHistory(index);
  const voteTrackId = ref?.trackId ?? history?.referendum?.trackId ?? null;
  const liveVotesEnabled = !!ref && ONGOING_PHASES.includes(ref.phase);
  const {
    data: liveVotes,
    isPending: liveVotesPending,
    error: liveVotesError,
    refetch: refetchLiveVotes,
  } = useReferendumVotes(index, voteTrackId, liveVotesEnabled);
  const tracks = useTracks();
  const fallbackIssuance = useActiveIssuance();
  const refForCall =
    ref && !ref.proposalHash && history?.referendum?.proposalHash
      ? {
          ...ref,
          proposalHash: history.referendum.proposalHash,
          proposalLen: history.referendum.proposalLen,
        }
      : ref;
  const { data: proposal } = useTokenProposal(refForCall, true, true);
  const call = proposal?.call;
  const remark = readableRemark(call?.root);

  if (!Number.isInteger(index) || index < 0) {
    return <p className="text-muted">Invalid referendum index.</p>;
  }
  if (error) {
    return (
      <ErrorNotice
        message={humanizeReadError(`referendum #${index}`)}
        onRetry={() => void refetch()}
      />
    );
  }
  if (isPending || !ref) {
    return (
      <div
        className="skeleton h-64"
        aria-busy="true"
      />
    );
  }

  // For finished referenda track/proposer are pruned from state — the indexer DB has them.
  const trackId = ref.trackId ?? history?.referendum?.trackId ?? null;
  const proposer = ref.proposer ?? history?.referendum?.proposer ?? null;
  const contentProposer = proposer ?? content?.proposer ?? null;
  const canEditContent = sameAccount(account?.address, contentProposer);
  const track = ref.snapshot?.track ?? tracks?.find((t) => t.id === trackId);
  const issuance = ref.snapshot?.activeIssuance;
  const isOngoing = ONGOING_PHASES.includes(ref.phase);
  const approval = ref.tally ? approvalFraction(ref.tally.ayes, ref.tally.nays) : null;
  const support =
    ref.tally && issuance ? supportFraction(ref.tally.support, issuance) : null;
  const outlook = referendumOutlook(ref);
  const approvalThreshold = outlook.approvalThreshold;
  const supportThreshold = outlook.supportThreshold;

  return (
    <div className="anim-rise">
      <Link href="/referenda" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Referenda
      </Link>
      <header className="rule-double relative pb-5">
        {!isOngoing && (
          <span
            className={`stamp absolute top-1 right-0 hidden text-sm sm:inline-block ${
              ref.phase === "approved"
                ? "text-aye"
                : ref.phase === "rejected" || ref.phase === "killed"
                  ? "text-nay"
                  : "text-muted"
            }`}
          >
            {PHASE_LABEL[ref.phase]}
          </span>
        )}
        <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="display tnum text-lg text-muted/70">
            No. {ref.index}
          </span>
          <TrackBadge track={track} />
          {isOngoing && <StatusPill phase={ref.phase} />}
        </div>
        <h1
          className={`display text-[28px] leading-tight font-semibold text-balance sm:text-[34px] ${
            !isOngoing ? "sm:pr-40" : ""
          }`}
        >
          {content?.title ?? `Referendum #${ref.index}`}
        </h1>
        {!isOngoing && (
          <div className="mt-2 sm:hidden">
            <StatusPill phase={ref.phase} />
          </div>
        )}
        {proposer && (
          <p className="mt-2 text-sm text-muted">
            Proposed by{" "}
            <ExplorerAccount address={proposer} />
          </p>
        )}

      </header>

      <div className="mt-6 space-y-4">
        <ReferendumTreasury referendum={ref} track={track} outlook={outlook} call={call}
          anchor={proposal?.anchor} content={content} historicalTiming={proposal?.timing}
          conditions={
            <div className={track && isOngoing ? "grid items-start gap-4 lg:grid-cols-2" : "space-y-4"}>
              <div className="space-y-3">
                {!isOngoing && <HistoryPanel index={ref.index} track={track} outcome={ref.phase} />}
                {ref.tally && <TallyPanel tally={ref.tally} approval={approval} support={support}
                  approvalThreshold={approvalThreshold} supportThreshold={supportThreshold}
                  live outlook={outlook} issuance={issuance} onVote={() => setVoteOpen(true)} />}
                {track && issuance && ref.tally && outlook.supportThreshold !== null && <p className="text-sm text-muted">
                  Support · {formatVara(ref.tally.support)} of {formatVara(requiredSupport(track, issuance, outlook.progress))} VARA required at this block.
                </p>}
                {isOngoing && !ref.decisionDepositWho && <div className="rounded-lg bg-warn/10 p-3 text-sm text-warn">
                  Decision deposit required · {track ? `${formatVara(track.decisionDeposit)} VARA` : "amount unavailable"}.
                  <DecisionDepositButton refIndex={ref.index} />
                </div>}
              </div>
              {track && isOngoing && <section className="panel min-w-0 p-4">
                <h2 className="label-serif mb-2">Approval &amp; support curves</h2>
                <CurveChart track={track} outlook={outlook} approval={outlook.approval ?? approval} support={outlook.support ?? support} />
                <Row label="Decision deposit">{formatVara(track.decisionDeposit)} VARA</Row>
                <Row label="Confirmation period">{blocksToDuration(track.confirmPeriod)}</Row>
              </section>}
            </div>
          }
          application={
            <section>
          {contentError && (
            <div className="mb-3">
              <ErrorNotice
                message={humanizeReadError("the title and description")}
                onRetry={() => void refetchContent()}
                compact
              />
            </div>
          )}
          <div
            className={
              content?.contentMd || remark
                ? "panel p-4"
                : "rounded-[14px] border border-dashed border-line p-4"
            }
          >
            <h2 className="label-serif mb-2">{call?.root.section === "system" && call.root.method === "remark" ? "Proposal text" : "Application and discussion"}</h2>
            {contentError ? (
              <p className="text-sm text-muted">
                The description is temporarily unavailable.
              </p>
            ) : content?.contentMd ? (
              <Markdown dropCap>{content.contentMd}</Markdown>
            ) : remark ? (
              <>
                <h2 className="label-serif mb-2">Remark</h2>
                <p className="whitespace-pre-wrap text-sm break-words">{remark}</p>
              </>
            ) : (
              <p className="text-sm text-muted">No description has been provided yet.</p>
            )}

            {!contentError && canEditContent && <p className="mt-3 text-xs text-muted">
              <a className="text-accent-ink underline" href={`https://vara.subsquare.io/referenda/${index}`} target="_blank" rel="noreferrer">Open on Subsquare to add context there</a>
            </p>}
            {!contentError && canEditContent ? (
              <button
                onClick={() => setEditOpen(true)}
                className="btn btn-soft mt-4"
              >
                <FilePenLine size={15} />
                {content?.title ? "Edit title & description" : "Add title & description"}
              </button>
            ) : !contentError && !content?.title ? (
              <p className="mt-3 text-xs text-muted">
                {account
                  ? "Only the on-chain proposer can add the title and description."
                  : "Connect the proposer wallet to add the title and description."}
              </p>
            ) : null}
          </div>
        </section>
          } />
      </div>
        {(isOngoing ? liveVotesError : historyError) ? (
          <div className="mt-6">
            <ErrorNotice
              message={humanizeReadError(
                isOngoing ? "live voter data" : "historical voting data",
              )}
              onRetry={() =>
                void (isOngoing ? refetchLiveVotes() : refetchHistory())
              }
              compact
            />
          </div>
        ) : (
          <VoteStatistics
            votes={isOngoing ? liveVotes ?? [] : history?.votes ?? []}
            electorate={
              isOngoing
                ? issuance ?? fallbackIssuance
                : history?.referendum?.finalTally?.electorate ?? null
            }
            live={isOngoing}
            loading={isOngoing ? liveVotesPending : !history}
          />
        )}


      <Comments refIndex={ref.index} />
      {voteOpen && <VotePopup referendum={ref} onClose={() => setVoteOpen(false)} />}
      {editOpen && <EditContent referendum={ref} existing={content ?? null} onClose={() => setEditOpen(false)} />}
    </div>
  );
}
