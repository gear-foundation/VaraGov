"use client";

import Link from "next/link";
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
    <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
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
    return <span className="text-xs text-muted">No votes yet</span>;
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

// One entry in the ledger. Render inside a `.panel divide-y divide-line`.
export function ReferendumRow({
  r,
  track,
  title,
  stagger = 0,
}: {
  r: Referendum;
  track: TrackInfo | undefined;
  title?: string | null;
  stagger?: number;
}) {
  const heading = title ?? `Referendum #${r.index}`;
  return (
    <Link
      href={`/referenda/${r.index}`}
      className="row-hover anim-rise group flex items-baseline gap-4 px-4 py-4 sm:gap-6 sm:px-6"
      style={{ ["--stagger" as string]: `${stagger}ms` }}
    >
      <span className="row-index display tnum w-10 shrink-0 text-right text-[22px] leading-none text-muted/60 sm:w-12 sm:text-2xl">
        {r.index}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="display row-title inline text-[17px] leading-snug font-medium sm:text-lg">
          {heading}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <StatusPill phase={r.phase} />
          <TrackBadge track={track} />
          {r.proposer && (
            <span
              className="tnum hidden text-xs text-muted/80 md:inline"
              title={r.proposer}
            >
              {shortAddress(r.proposer)}
            </span>
          )}
        </div>
      </div>
      <div className="hidden w-52 shrink-0 self-center sm:block">
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
