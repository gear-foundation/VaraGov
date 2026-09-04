"use client";

import { use, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { hexToString, isHex } from "@polkadot/util";
import { useApi } from "@/lib/chain/ApiProvider";
import { useWallet } from "@/lib/chain/wallet";
import { useSendTx, TX_LABEL } from "@/lib/chain/tx";
import { VotePopup } from "@/components/VotePopup";
import { EditContent } from "@/components/EditContent";
import { Comments } from "@/components/Comments";
import { HistoryPanel, useHistory } from "@/components/HistoryPanel";
import { Markdown } from "@/components/Markdown";
import { useContent } from "@/lib/content";
import {
  useActiveIssuance,
  useDecodedCall,
  useReferendum,
  useTracks,
} from "@/lib/chain/hooks";
import {
  approvalFraction,
  curveThreshold,
  decidingProgress,
  supportFraction,
} from "@/lib/chain/curves";
import {
  blockToDate,
  blocksToDuration,
  formatVara,
  percent,
  shortAddress,
} from "@/lib/chain/format";
import { ONGOING_PHASES } from "@/lib/chain/referenda";
import { PHASE_LABEL, StatusPill, TrackBadge } from "@/components/referenda";
import { CurveChart } from "@/components/CurveChart";
import { CallViewer } from "@/components/CallViewer";
import { GovernanceNav } from "@/components/GovernanceNav";
import type { DecodedCallNode } from "@/lib/chain/call-decoder";

function DecisionDepositButton({ refIndex }: { refIndex: number }) {
  const { api } = useApi();
  const { account } = useWallet();
  const { status, send } = useSendTx();
  const queryClient = useQueryClient();
  const busy = status.state === "signing" || status.state === "broadcast";
  return (
    <div className="mt-2">
      <button
        disabled={!account || !api || busy}
        onClick={async () => {
          const ok = await send(api!.tx.referenda.placeDecisionDeposit(refIndex));
          if (ok)
            await queryClient.invalidateQueries({ queryKey: ["referendum", refIndex] });
        }}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
          !account || busy
            ? "cursor-not-allowed bg-surface-2 text-muted"
            : "bg-warn/20 text-warn hover:opacity-90"
        }`}
      >
        {busy
          ? TX_LABEL[status.state]
          : account
            ? "Place decision deposit"
            : "Connect a wallet to place the deposit"}
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
  const { data: content } = useContent(index);
  const { finalizedNumber } = useApi();
  const { data: ref, isPending, error } = useReferendum(index);
  const { data: history } = useHistory(index);
  const tracks = useTracks();
  const issuance = useActiveIssuance();
  const refForCall =
    ref && !ref.proposalHash && history?.referendum?.proposalHash
      ? {
          ...ref,
          proposalHash: history.referendum.proposalHash,
          proposalLen: history.referendum.proposalLen,
        }
      : ref;
  const { data: call } = useDecodedCall(refForCall);
  const remark = readableRemark(call?.root);

  if (!Number.isInteger(index) || index < 0) {
    return <p className="text-muted">Invalid referendum index.</p>;
  }
  if (error) {
    return (
      <p className="text-nay">Failed to load referendum: {String(error)}</p>
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
  const track = tracks?.find((t) => t.id === trackId);
  const isOngoing = ONGOING_PHASES.includes(ref.phase);
  const approval = ref.tally ? approvalFraction(ref.tally.ayes, ref.tally.nays) : null;
  const support =
    ref.tally && issuance ? supportFraction(ref.tally.support, issuance) : null;
  const progress =
    track && finalizedNumber
      ? decidingProgress(finalizedNumber, ref.decidingSince, track.decisionPeriod)
      : 0;
  const approvalThreshold = track ? curveThreshold(track.minApproval, progress) : null;
  const supportThreshold = track ? curveThreshold(track.minSupport, progress) : null;

  const passingNow =
    approval !== null &&
    support !== null &&
    approvalThreshold !== null &&
    supportThreshold !== null &&
    approval >= approvalThreshold &&
    support >= supportThreshold;

  return (
    <div>
      <GovernanceNav />
      <div className="anim-rise mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="relative min-w-0">
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
            <span className="tnum" title={proposer}>
              {shortAddress(proposer)}
            </span>
            {ref.submittedAt !== null && finalizedNumber !== null && (
              <>
                {" · "}
                {blockToDate(ref.submittedAt, finalizedNumber).toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "short", year: "numeric" },
                )}
              </>
            )}
          </p>
        )}

        <section className="mt-6">
          {content?.contentMd ? (
            <div className="panel p-4">
              <Markdown dropCap>{content.contentMd}</Markdown>
            </div>
          ) : remark ? (
            <div className="panel p-4">
              <h2 className="label-serif mb-2">Remark</h2>
              <p className="whitespace-pre-wrap text-sm break-words">{remark}</p>
            </div>
          ) : (
            <div className="rounded-[14px] border border-dashed border-line p-4 text-sm text-muted">
              No description has been provided yet.
            </div>
          )}
          {account &&
            (account.address === proposer ||
              (content?.proposer && account.address === content.proposer)) && (
              <button
                onClick={() => setEditOpen(true)}
                className="mt-2 text-sm font-medium text-accent-ink hover:underline"
              >
                {content?.title ? "Edit title & description" : "Add title & description"}
              </button>
            )}
        </section>

        <section className="mt-6 panel p-4">
          <h2 className="label-serif mb-3">Proposal call</h2>
          {call ? (
            <CallViewer root={call.root} />
          ) : ref.proposalHash ? (
            <p className="tnum break-all text-xs text-muted">
              Preimage {ref.proposalHash} (
              {ref.proposalLen !== null ? `${ref.proposalLen} bytes` : "unknown size"}
              ) — not available on chain, cannot decode.
            </p>
          ) : (
            <p className="text-xs text-muted">No proposal data.</p>
          )}
        </section>

        <Comments refIndex={ref.index} />
      </div>

      <aside className="space-y-4">
        {!isOngoing && <HistoryPanel index={ref.index} />}
        {ref.tally && (
          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted">Tally · live</h2>
              {isOngoing && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    passingNow
                      ? "bg-aye/15 text-aye"
                      : "bg-nay/15 text-nay"
                  }`}
                >
                  {passingNow ? "Passing" : "Failing"}
                </span>
              )}
            </div>
            <Row label="Aye">{formatVara(ref.tally.ayes)} VARA</Row>
            <Row label="Nay">{formatVara(ref.tally.nays)} VARA</Row>
            <Row label="Approval">
              {percent(approval)}
              {approvalThreshold !== null && (
                <span className="text-muted"> / {percent(approvalThreshold)}</span>
              )}
            </Row>
            <Row label="Support">
              {percent(support)}
              {supportThreshold !== null && (
                <span className="text-muted"> / {percent(supportThreshold)}</span>
              )}
            </Row>
            {isOngoing && (
              <button
                onClick={() => setVoteOpen(true)}
                title={account ? undefined : "Connect a wallet in the header first"}
                className="btn btn-primary mt-3 w-full"
              >
                Vote
              </button>
            )}
          </section>
        )}
        {voteOpen && (
          <VotePopup referendum={ref} onClose={() => setVoteOpen(false)} />
        )}
        {editOpen && (
          <EditContent
            referendum={ref}
            existing={content ?? null}
            onClose={() => setEditOpen(false)}
          />
        )}

        <section className="panel p-4">
          <h2 className="label-serif mb-2">Status</h2>
          <Row label="Phase">{PHASE_LABEL[ref.phase]}</Row>
          {ref.submittedAt !== null && (
            <Row label="Submitted">#{ref.submittedAt.toLocaleString("en-US")}</Row>
          )}
          {ref.decidingSince !== null && (
            <Row label="Deciding since">
              #{ref.decidingSince.toLocaleString("en-US")}
            </Row>
          )}
          {ref.phase === "deciding" && track && (
            <Row label="Decision progress">{percent(progress)}</Row>
          )}
          {ref.confirmingUntil !== null && finalizedNumber !== null && (
            <Row label="Confirm ends">
              ~
              {blockToDate(ref.confirmingUntil, finalizedNumber).toLocaleString(
                "en-GB",
                { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
              )}
            </Row>
          )}
          {ref.decidedAt !== null && (
            <Row label="Decided at">#{ref.decidedAt.toLocaleString("en-US")}</Row>
          )}
          {isOngoing && !ref.decisionDepositWho && (
            <div className="mt-2 rounded-lg bg-warn/10 p-2.5 text-xs text-warn">
              No decision deposit yet — this referendum will time out 14 days after
              submission unless someone places{" "}
              {track ? `${formatVara(track.decisionDeposit)} VARA` : "the deposit"}.
              Anyone can place it.
              <DecisionDepositButton refIndex={ref.index} />
            </div>
          )}
        </section>

        {track && (
          <section className="panel p-4">
            <h2 className="label-serif mb-2">
              Track · {track.displayName}
            </h2>
            <Row label="Decision deposit">{formatVara(track.decisionDeposit)} VARA</Row>
            <Row label="Prepare">{blocksToDuration(track.preparePeriod)}</Row>
            <Row label="Decision">{blocksToDuration(track.decisionPeriod)}</Row>
            <Row label="Confirm">{blocksToDuration(track.confirmPeriod)}</Row>
            <Row label="Min enactment">
              {blocksToDuration(track.minEnactmentPeriod)}
            </Row>
          </section>
        )}

        {track && isOngoing && (
          <section className="panel p-4">
            <h2 className="label-serif mb-2">
              Approval &amp; support curves
            </h2>
            <CurveChart
              track={track}
              progress={progress}
              approval={approval}
              support={support}
            />
          </section>
        )}
        </aside>
      </div>
    </div>
  );
}
