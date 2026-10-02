"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BN } from "@polkadot/util";
import { Check, ChevronDown, Copy, UsersRound } from "lucide-react";
import {
  approvalFraction,
  curveThreshold,
  decidingProgress,
  supportFraction,
} from "@/lib/chain/curves";
import { formatVara, percent, shortAddress } from "@/lib/chain/format";
import type { Phase } from "@/lib/chain/referenda";
import type { TrackInfo } from "@/lib/chain/tracks";
import { CONVICTIONS } from "@/lib/chain/voting";
import { PHASE_LABEL } from "@/components/referenda";

export type VoteDto = {
  voter: string;
  kind: string;
  aye: string | null;
  nay: string | null;
  abstain: string | null;
  conviction: number | null;
};

export type HistoryDto = {
  referendum: {
    trackId: number | null;
    proposer: string | null;
    proposalHash: string | null;
    proposalLen: number | null;
    submittedAt: number | null;
    finalTally: {
      ayes: string;
      nays: string;
      support: string;
      electorate?: string;
    } | null;
    decidingSince: number | null;
    decidedAt: number | null;
  } | null;
  votes: VoteDto[];
};

export function useHistory(index: number) {
  return useQuery({
    queryKey: ["history", index],
    queryFn: async (): Promise<HistoryDto> => {
      const res = await fetch(`/api/referenda/${index}`);
      if (!res.ok) throw new Error("Could not load referendum history.");
      return res.json();
    },
    staleTime: 60_000,
  });
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value * 100));
}

function detailedPercent(value: number, precision: number) {
  return `${(value * 100).toFixed(precision)}%`;
}

function ThresholdBar({
  value,
  threshold,
  label,
  precision = 1,
}: {
  value: number;
  threshold: number | null;
  label: string;
  precision?: number;
}) {
  const width = clampPercent(value);
  const marker = threshold === null ? null : clampPercent(threshold);
  const thresholdLabel =
    threshold === null ? null : detailedPercent(threshold, precision);
  const thresholdComparison =
    threshold !== null && threshold > 0
      ? value >= threshold
        ? `Met · ${(value / threshold).toFixed(2)}×`
        : `${Math.round((value / threshold) * 100)}% of required`
      : null;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        {thresholdLabel && (
          <span className={value >= (threshold ?? 0) ? "text-aye" : "text-nay"}>
            Required {thresholdLabel}
            {thresholdComparison && ` · ${thresholdComparison}`}
          </span>
        )}
      </div>
      <div
        className="relative h-2 overflow-visible rounded-[2px] bg-nay/25"
        role="img"
        aria-label={`${label} ${detailedPercent(value, precision)}${threshold === null ? "" : `, required ${detailedPercent(threshold, precision)}`}`}
      >
        <div className="anim-bar h-full rounded-[2px] bg-aye" style={{ width: `${width}%` }} />
        {marker !== null && (
          <span
            className="absolute top-[-3px] h-3.5 w-px bg-ink"
            style={{ left: `${marker}%` }}
            title={`Required ${thresholdLabel}`}
          />
        )}
      </div>
    </div>
  );
}

export function TallyPanel({
  tally,
  approval,
  support,
  approvalThreshold = null,
  supportThreshold = null,
  live = false,
  passing = null,
  outcome,
  issuance,
  onVote,
}: {
  tally: { ayes: BN | string; nays: BN | string; support: BN | string };
  approval: number | null;
  support: number | null;
  approvalThreshold?: number | null;
  supportThreshold?: number | null;
  live?: boolean;
  passing?: boolean | null;
  outcome?: Phase;
  issuance?: BN | null;
  onVote?: () => void;
}) {
  const nayShare = approval === null ? null : 1 - approval;
  const verdict = live
    ? passing === null
      ? null
      : passing
        ? "Passing"
        : "Failing"
    : outcome
      ? PHASE_LABEL[outcome]
      : null;
  const verdictTone = live
    ? passing
      ? "text-aye"
      : "text-nay"
    : outcome === "approved"
      ? "text-aye"
      : outcome === "rejected" || outcome === "killed"
        ? "text-nay"
        : "text-muted";
  return (
    <section className="panel tally-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line-strong bg-surface-2 px-4 py-3">
        <div>
          <h2 className="label-serif">{live ? "Live tally" : "Final tally"}</h2>
          <p className="mt-0.5 text-[11px] text-muted">Conviction-weighted voting power</p>
        </div>
        {verdict && (
          <span className={`tally-verdict ${verdictTone}`}>
            {verdict}
          </span>
        )}
      </div>

      <div className="space-y-5 p-4">
        <div>
          <div className="mb-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-aye">Aye</p>
              <p className="display tnum mt-0.5 text-3xl font-semibold text-aye">{percent(approval)}</p>
              <p className="tnum mt-1 text-xs text-muted">{formatVara(tally.ayes)} VARA</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-nay">Nay</p>
              <p className="display tnum mt-0.5 text-3xl font-semibold text-nay">{percent(nayShare)}</p>
              <p className="tnum mt-1 text-xs text-muted">{formatVara(tally.nays)} VARA</p>
            </div>
          </div>
          {approval !== null ? (
            <ThresholdBar value={approval} threshold={approvalThreshold} label="Approval" />
          ) : (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">No directional votes yet.</p>
          )}
        </div>

        <div className="border-t border-line-strong pt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Support</p>
              <p className="display tnum mt-1 text-xl font-semibold">
                {support === null
                  ? formatVara(tally.support)
                  : detailedPercent(support, 2)}
              </p>
            </div>
            <p className="tnum text-right text-xs text-muted">
              {support === null ? "VARA of support" : `${formatVara(tally.support)} VARA`}
            </p>
          </div>
          {support !== null && (
            <div className="mt-3">
              <ThresholdBar
                value={support}
                threshold={supportThreshold}
                label="Active issuance support"
                precision={2}
              />
            </div>
          )}
          {issuance && (
            <p className="tnum mt-2 text-[11px] text-muted">Active issuance {formatVara(issuance)} VARA</p>
          )}
        </div>

        {onVote && (
          <button onClick={onVote} className="btn btn-primary w-full">Cast vote</button>
        )}
      </div>
    </section>
  );
}

function voteAmount(v: VoteDto): { side: string; amount: string } {
  const aye = BigInt(v.aye ?? 0);
  const nay = BigInt(v.nay ?? 0);
  const abstain = BigInt(v.abstain ?? 0);
  const populated =
    Number(aye > BigInt(0)) +
    Number(nay > BigInt(0)) +
    Number(abstain > BigInt(0));
  if (populated > 1) return { side: "Split", amount: (aye + nay + abstain).toString() };
  if (abstain > BigInt(0)) return { side: "Abstain", amount: abstain.toString() };
  if (aye > BigInt(0)) return { side: "Aye", amount: aye.toString() };
  if (nay > BigInt(0)) return { side: "Nay", amount: nay.toString() };
  return { side: v.kind, amount: "0" };
}

function sumVotes(votes: VoteDto[], key: "aye" | "nay" | "abstain") {
  return votes.reduce((sum, vote) => sum + BigInt(vote[key] ?? 0), BigInt(0));
}

function convictionLabel(votes: VoteDto[]) {
  const standard = votes.filter((vote) => vote.conviction !== null);
  if (standard.length === 0) return "—";
  const average =
    standard.reduce((sum, vote) => {
      const conviction = vote.conviction ?? 0;
      return sum + (conviction === 0 ? 0.1 : conviction);
    }, 0) / standard.length;
  return `${average.toFixed(1)}x`;
}

function directTurnout(
  capital: bigint,
  electorate: BN | string | null | undefined,
) {
  if (!electorate) return null;
  const total = BigInt(electorate.toString());
  if (total <= BigInt(0)) return null;
  return Number((capital * BigInt(10_000_000)) / total) / 10_000_000;
}

export function VoteStatistics({
  votes,
  electorate,
}: {
  votes: VoteDto[];
  electorate?: BN | string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copiedVoter, setCopiedVoter] = useState<string | null>(null);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    },
    [],
  );

  if (votes.length === 0) return null;

  const copyVoter = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedVoter(address);
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setCopiedVoter(null), 1_800);
    } catch {
      setCopiedVoter(null);
    }
  };

  const aye = sumVotes(votes, "aye");
  const nay = sumVotes(votes, "nay");
  const abstain = sumVotes(votes, "abstain");
  const capital = aye + nay + abstain;
  const ayeWidth =
    capital === BigInt(0) ? 0 : Number((aye * BigInt(10_000)) / capital) / 100;
  const nayWidth =
    capital === BigInt(0) ? 0 : Number((nay * BigInt(10_000)) / capital) / 100;
  const abstainWidth = Math.max(0, 100 - ayeWidth - nayWidth);
  const turnout = directTurnout(capital, electorate);
  const sideCounts = votes.reduce(
    (counts, vote) => {
      const side = voteAmount(vote).side;
      if (side === "Aye") counts.aye += 1;
      else if (side === "Nay") counts.nay += 1;
      else if (side === "Abstain") counts.abstain += 1;
      else counts.split += 1;
      return counts;
    },
    { aye: 0, nay: 0, abstain: 0, split: 0 },
  );
  const largest = votes.reduce((current, vote) => {
    const amount =
      BigInt(vote.aye ?? 0) +
      BigInt(vote.nay ?? 0) +
      BigInt(vote.abstain ?? 0);
    return amount > current ? amount : current;
  }, BigInt(0));

  return (
    <section className="panel mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-strong bg-surface-2 px-4 py-3 sm:px-5">
        <h2 className="label-serif flex items-center gap-2"><UsersRound size={15} /> Voting statistics</h2>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          Direct vote snapshot
        </span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="stat-metric">
            <p className="text-xs text-muted">Participants</p>
            <p className="display tnum mt-1 text-2xl font-semibold">{votes.length}</p>
            <p className="text-[11px] text-muted">direct accounts</p>
          </div>
          <div className="stat-metric">
            <p className="text-xs text-muted">Direct turnout</p>
            <p className="display tnum mt-1 text-2xl font-semibold">
              {turnout === null
                ? "—"
                : detailedPercent(turnout, turnout < 0.01 ? 3 : 2)}
            </p>
            <p className="text-[11px] text-muted">
              {turnout === null ? "electorate unavailable" : "of active issuance"}
            </p>
          </div>
          <div className="stat-metric">
            <p className="text-xs text-muted">Capital cast</p>
            <p className="display tnum mt-1 text-2xl font-semibold">{formatVara(capital.toString())}</p>
            <p className="text-[11px] text-muted">VARA before conviction</p>
          </div>
          <div className="stat-metric">
            <p className="text-xs text-muted">Average conviction</p>
            <p className="display tnum mt-1 text-2xl font-semibold">{convictionLabel(votes)}</p>
            <p className="text-[11px] text-muted">standard votes</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold">Direct capital composition</p>
              <p className="text-[11px] text-muted">Unweighted capital recorded per direction</p>
            </div>
            <p className="tnum shrink-0 text-right text-[11px] text-muted">
              Largest {formatVara(largest.toString())} VARA
            </p>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-[2px] bg-surface-2" aria-label="Unweighted capital by vote direction">
            <span className="bg-aye" style={{ width: `${ayeWidth}%` }} />
            <span className="bg-nay" style={{ width: `${nayWidth}%` }} />
            <span className="bg-abstain" style={{ width: `${abstainWidth}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4">
            <span className="tnum text-aye">Aye {formatVara(aye.toString())}<small className="mt-0.5 block text-[11px] text-muted">{sideCounts.aye} accounts</small></span>
            <span className="tnum text-nay">Nay {formatVara(nay.toString())}<small className="mt-0.5 block text-[11px] text-muted">{sideCounts.nay} accounts</small></span>
            <span className="tnum text-muted">Abstain {formatVara(abstain.toString())}<small className="mt-0.5 block text-[11px]">{sideCounts.abstain} accounts</small></span>
            <span className="tnum text-muted">Split votes<small className="mt-0.5 block text-[11px]">{sideCounts.split} accounts</small></span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-6 flex w-full items-center justify-between border-t border-line pt-4 text-sm font-medium"
          aria-expanded={expanded}
        >
          <span>Voter register · {votes.length}</span>
          <ChevronDown size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {expanded && (
          <div className="mt-3 divide-y divide-line">
            {votes.map((vote) => {
              const { side, amount } = voteAmount(vote);
              return (
                <div key={vote.voter} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <button
                    type="button"
                    onClick={() => copyVoter(vote.voter)}
                    className="group -ml-1.5 inline-flex min-w-0 items-center gap-1.5 rounded-[4px] px-1.5 py-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                    title={copiedVoter === vote.voter ? "Address copied" : `Copy ${vote.voter}`}
                    aria-label={copiedVoter === vote.voter ? "Address copied" : `Copy voter address ${vote.voter}`}
                  >
                    <span className="tnum truncate">{shortAddress(vote.voter)}</span>
                    {copiedVoter === vote.voter ? (
                      <>
                        <Check size={13} className="shrink-0 text-aye" aria-hidden="true" />
                        <span className="text-[10px] font-medium text-aye">Copied</span>
                      </>
                    ) : (
                      <Copy
                        size={13}
                        className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                  <span className={`tnum text-right ${side === "Aye" ? "text-aye" : side === "Nay" ? "text-nay" : "text-muted"}`}>
                    {side} · {formatVara(amount)}
                    {vote.conviction !== null && ` · ${CONVICTIONS[vote.conviction]?.label ?? ""}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// Historical aggregate only. The voter register is deliberately kept lower on the page.
export function HistoryPanel({
  index,
  track,
  outcome,
}: {
  index: number;
  track?: TrackInfo;
  outcome?: Phase;
}) {
  const { data } = useHistory(index);
  const tally = data?.referendum?.finalTally;
  if (!tally) return null;
  const approval = approvalFraction(new BN(tally.ayes), new BN(tally.nays));
  const electorate = tally.electorate ? new BN(tally.electorate) : null;
  const support = electorate
    ? supportFraction(new BN(tally.support), electorate)
    : null;
  const decidingSince = data.referendum?.decidingSince ?? null;
  const decidedAt = data.referendum?.decidedAt ?? null;
  const progress =
    track && decidingSince !== null && decidedAt !== null
      ? decidingProgress(
          decidedAt,
          decidingSince,
          track.decisionPeriod,
        )
      : null;
  return (
    <TallyPanel
      tally={tally}
      approval={approval}
      support={support}
      approvalThreshold={
        track && progress !== null ? curveThreshold(track.minApproval, progress) : null
      }
      supportThreshold={
        track && progress !== null ? curveThreshold(track.minSupport, progress) : null
      }
      outcome={outcome}
      issuance={electorate}
    />
  );
}
