"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTokenProposal } from "@/lib/chain/proposal-hooks";
import { proposalSummary } from "@/lib/chain/treasury";
import { nextReferendumStage, enactmentBlock } from "@/lib/chain/referendum-timing";
import { dateLabel, estimatedDate, type ChainClock } from "@/lib/chain/chain-clock";
import { Money, type Quote } from "./TreasuryValues";
import { IdentityName } from "./IdentityName";
import { ArrowUpRight, Coins, MessageSquare } from "lucide-react";
import { VotingOutlook } from "./VotingOutlook";
import type { ReferendumOutlook } from "@/lib/chain/referendum-outlook";
import type { BN } from "@polkadot/util";
import type { Phase, Referendum } from "@/lib/chain/referenda";
import type { TrackInfo } from "@/lib/chain/tracks";
import { approvalFraction } from "@/lib/chain/curves";
import { percent, shortAddress } from "@/lib/chain/format";

export const PHASE_LABEL: Record<Phase, string> = {
  preparing: "Preparing",
  queueing: "Queueing",
  deciding: "Deciding",
  confirming: "Confirming",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  timedOut: "Timed out",
  killed: "Killed",
};

const PHASE_COLOR: Record<Phase, string> = {
  preparing: "text-muted",
  queueing: "text-muted",
  deciding: "text-warn",
  confirming: "text-accent-ink",
  approved: "text-aye",
  rejected: "text-nay",
  cancelled: "text-muted",
  timedOut: "text-muted",
  killed: "text-nay",
};

const PHASE_DOT: Record<Phase, string> = {
  preparing: "bg-muted",
  queueing: "bg-muted",
  deciding: "bg-warn",
  confirming: "bg-accent",
  approved: "bg-aye",
  rejected: "bg-nay",
  cancelled: "bg-muted",
  timedOut: "bg-muted",
  killed: "bg-nay",
};

const LIVE_PHASES: Phase[] = ["deciding", "confirming"];

// Small-caps status mark — ledger vocabulary, not a pill.
export function StatusPill({ phase }: { phase: Phase }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${PHASE_COLOR[phase]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${PHASE_DOT[phase]} ${
          LIVE_PHASES.includes(phase) ? "live-dot" : ""
        }`}
      />
      {PHASE_LABEL[phase]}
    </span>
  );
}

export function TrackBadge({ track }: { track: TrackInfo | undefined }) {
  if (!track) return null;
  return (
    <span
      className="block truncate text-[11px] uppercase tracking-[0.14em] text-muted"
      title={track.displayName}
    >
      {track.displayName}
    </span>
  );
}

export function TallyBar({
  ayes,
  nays,
  stagger = 0,
}: {
  ayes: BN;
  nays: BN;
  stagger?: number;
}) {
  const approval = approvalFraction(ayes, nays);
  if (approval === null) {
    return <span className="block text-right text-xs text-muted">No votes yet</span>;
  }
  return (
    <div className="flex items-center gap-3">
      <span className="tnum w-13 shrink-0 text-right text-xs font-medium text-aye">
        {percent(approval)}
      </span>
      <div
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-nay/25"
        role="img"
        aria-label={`Approval ${percent(approval)}`}
      >
        <div
          className="anim-bar h-full rounded-full bg-aye"
          style={{ width: `${approval * 100}%`, ["--stagger" as string]: `${stagger}ms` }}
        />
      </div>
      <span className="tnum w-13 shrink-0 text-xs text-muted">
        {percent(1 - approval)}
      </span>
    </div>
  );
}

function ProposalPreview({ referendum, track, outlook, quote, clock }: {
  referendum: Referendum; track?: TrackInfo; outlook: ReferendumOutlook; quote?: Quote; clock?: ChainClock;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!element.current || visible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "150px" });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [visible]);
  const { data } = useTokenProposal(referendum, visible);
  const summary = proposalSummary(data?.call?.root, track?.name);
  const next = nextReferendumStage(referendum, track, outlook);
  const nextDate = estimatedDate(clock, next?.block);
  const enactment = estimatedDate(clock, enactmentBlock(referendum, track, outlook.approvalBlock));
  return <div ref={element} className="mt-2 space-y-1 text-xs text-muted">
    {summary.kind && <p className="font-medium text-muted">{summary.kind}</p>}
    {summary.spends.map((spend, i) => <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
      <Coins size={14} className="shrink-0 text-accent-ink" aria-hidden />
      <span className="font-medium text-ink"><Money amount={spend.amount} quote={quote} /></span>
      <span className="inline-flex min-w-0 items-center gap-1">to <IdentityName address={spend.beneficiary} /></span>
    </div>)}
    {next && <p>{next.label}{nextDate && ` · ~${dateLabel(nextDate)}`}</p>}
    {enactment && <p>Earliest enactment · ~{dateLabel(enactment)}</p>}
    {data && summary.incomplete && <p>Proposal details unavailable.</p>}
  </div>;
}

// One entry in the ledger. Render inside a `.panel divide-y divide-line`.
export function ReferendumRow({
  r,
  track,
  title,
  hrefBase = "/referenda",
  fallbackLabel,
  stagger = 0,
  commentCount,
  showComments = false,
  outlook,
  quote,
  clock,
}: {
  r: Referendum;
  track: TrackInfo | undefined;
  title?: string | null;
  hrefBase?: string;
  fallbackLabel?: string;
  stagger?: number;
  commentCount?: number;
  showComments?: boolean;
  outlook?: ReferendumOutlook;
  quote?: Quote;
  clock?: ChainClock;
}) {
  const heading =
    title ??
    `${track ? `[${track.displayName}] ` : fallbackLabel ? `[${fallbackLabel}] ` : ""}Referendum #${r.index}`;
  return (
    <Link
      href={`${hrefBase}/${r.index}`}
      className="row-hover anim-rise group grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-x-3 px-4 py-4 sm:grid-cols-[3rem_minmax(0,1fr)_13rem] sm:gap-x-6 sm:px-6"
      style={{ ["--stagger" as string]: `${stagger}ms` }}
    >
      <span className="row-index display tnum text-right text-[22px] leading-none text-muted/60 sm:text-2xl">
        {r.index}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="display row-title inline text-[17px] leading-snug font-medium sm:text-lg">
          {heading}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusPill phase={r.phase} />
          <TrackBadge track={track} />
          {r.proposer && (
            <span
              className="tnum hidden max-w-32 truncate text-xs text-muted/80 md:block"
              title={r.proposer}
            >
              {shortAddress(r.proposer)}
            </span>
          )}
        </div>
        {outlook && <ProposalPreview referendum={r} track={track} outlook={outlook} quote={quote} clock={clock} />}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          {outlook && <VotingOutlook outlook={outlook} compact clock={clock} />}
          {showComments && (
            <span className="tnum mt-2 ml-auto inline-flex items-center gap-1.5 text-xs text-muted"
              aria-label={commentCount === undefined ? "Comment count unavailable" : `${commentCount} comments`}>
              <MessageSquare size={13} aria-hidden /> {commentCount ?? "—"}
            </span>
          )}
        </div>
      </div>
      <div className="hidden min-w-0 space-y-2 pt-1 sm:block">
        <ArrowUpRight size={15} className="ml-auto text-muted transition-colors group-hover:text-accent-ink" aria-hidden />
        {r.tally ? (
          <TallyBar ayes={r.tally.ayes} nays={r.tally.nays} stagger={stagger + 150} />
        ) : r.decidedAt !== null ? (
          <span className="tnum block text-right text-xs text-muted/80">
            Decided at #{r.decidedAt.toLocaleString("en-US")}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-[74px]" />
      ))}
    </div>
  );
}
