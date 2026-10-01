"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BN } from "@polkadot/util";
import { ChevronDown, UsersRound } from "lucide-react";
import {
  approvalFraction,
  curveThreshold,
  decidingProgress,
  supportFraction,
} from "@/lib/chain/curves";
import { formatVara, percent, shortAddress } from "@/lib/chain/format";
import type { TrackInfo } from "@/lib/chain/tracks";
import { CONVICTIONS } from "@/lib/chain/voting";

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
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        {thresholdLabel && <span>Required {thresholdLabel}</span>}
      </div>
      <div
        className="relative h-2 overflow-visible rounded-full bg-nay/25"
        role="img"
        aria-label={`${label} ${detailedPercent(value, precision)}${threshold === null ? "" : `, required ${detailedPercent(threshold, precision)}`}`}
      >
        <div className="anim-bar h-full rounded-full bg-aye" style={{ width: `${width}%` }} />
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
  issuance?: BN | null;
  onVote?: () => void;
}) {
  const nayShare = approval === null ? null : 1 - approval;
  return (
    <section className="panel tally-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
        <div>
          <h2 className="label-serif">{live ? "Live tally" : "Final tally"}</h2>
          <p className="mt-0.5 text-[11px] text-muted">Conviction-weighted voting power</p>
        </div>
        {passing !== null && (
          <span className={`tally-verdict ${passing ? "text-aye" : "text-nay"}`}>
            {passing ? "Passing" : "Failing"}
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

        <div className="border-t border-line pt-4">
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

export function VoteStatistics({ votes }: { votes: VoteDto[] }) {
  const [expanded, setExpanded] = useState(false);
  if (votes.length === 0) return null;

  const aye = sumVotes(votes, "aye");
  const nay = sumVotes(votes, "nay");
  const abstain = sumVotes(votes, "abstain");
  const capital = aye + nay + abstain;
  const ayeWidth =
    capital === BigInt(0) ? 0 : Number((aye * BigInt(10_000)) / capital) / 100;
  const nayWidth =
    capital === BigInt(0) ? 0 : Number((nay * BigInt(10_000)) / capital) / 100;
  const abstainWidth = Math.max(0, 100 - ayeWidth - nayWidth);

  return (
    <section className="panel mt-6 overflow-hidden">
      <div className="border-b border-line bg-surface-2 px-4 py-3 sm:px-5">
        <h2 className="label-serif flex items-center gap-2"><UsersRound size={15} /> Voting statistics</h2>
      </div>
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted">Participants</p>
            <p className="display tnum mt-1 text-2xl font-semibold">{votes.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Capital cast</p>
            <p className="display tnum mt-1 text-2xl font-semibold">{formatVara(capital.toString())}</p>
            <p className="text-[11px] text-muted">VARA before conviction</p>
          </div>
          <div>
            <p className="text-xs text-muted">Average conviction</p>
            <p className="display tnum mt-1 text-2xl font-semibold">{convictionLabel(votes)}</p>
            <p className="text-[11px] text-muted">standard votes</p>
          </div>
          <div>
            <p className="text-xs text-muted">Largest position</p>
            <p className="display tnum mt-1 text-2xl font-semibold">
              {formatVara(votes.reduce((largest, vote) => {
                const amount = BigInt(vote.aye ?? 0) + BigInt(vote.nay ?? 0) + BigInt(vote.abstain ?? 0);
                return amount > largest ? amount : largest;
              }, BigInt(0)).toString())}
            </p>
            <p className="text-[11px] text-muted">VARA</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-label="Unweighted capital by vote direction">
            <span className="bg-aye" style={{ width: `${ayeWidth}%` }} />
            <span className="bg-nay" style={{ width: `${nayWidth}%` }} />
            <span className="bg-abstain" style={{ width: `${abstainWidth}%` }} />
          </div>
          <div className="mt-2 grid gap-1 text-xs sm:grid-cols-3">
            <span className="tnum text-aye">Aye {formatVara(aye.toString())}</span>
            <span className="tnum text-nay sm:text-center">Nay {formatVara(nay.toString())}</span>
            <span className="tnum text-muted sm:text-right">Abstain {formatVara(abstain.toString())}</span>
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
                  <span className="tnum text-muted" title={vote.voter}>{shortAddress(vote.voter)}</span>
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
}: {
  index: number;
  track?: TrackInfo;
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
      issuance={electorate}
    />
  );
}
