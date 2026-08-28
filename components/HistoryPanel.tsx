"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BN } from "@polkadot/util";
import { approvalFraction } from "@/lib/chain/curves";
import { formatVara, percent, shortAddress } from "@/lib/chain/format";
import { CONVICTIONS } from "@/lib/chain/voting";

type VoteDto = {
  voter: string;
  kind: string;
  aye: string | null;
  nay: string | null;
  abstain: string | null;
  conviction: number | null;
};

type HistoryDto = {
  referendum: {
    trackId: number | null;
    proposer: string | null;
    proposalHash: string | null;
    proposalLen: number | null;
    submittedAt: number | null;
    finalTally: { ayes: string; nays: string; support: string } | null;
    decidedAt: number | null;
  } | null;
  votes: VoteDto[];
};

export function useHistory(index: number) {
  return useQuery({
    queryKey: ["history", index],
    queryFn: async (): Promise<HistoryDto> => {
      const res = await fetch(`/api/referenda/${index}`);
      return res.json();
    },
    staleTime: 60_000,
  });
}

function voteAmount(v: VoteDto): { side: string; amount: string } {
  if (v.kind === "splitAbstain" && v.abstain && v.abstain !== "0")
    return { side: "Abstain", amount: v.abstain };
  if (v.aye && v.aye !== "0") return { side: "Aye", amount: v.aye };
  if (v.nay && v.nay !== "0") return { side: "Nay", amount: v.nay };
  return { side: v.kind, amount: "0" };
}

// Final tally + voter list for finished referenda, served from the indexer DB.
export function HistoryPanel({ index }: { index: number }) {
  const { data } = useHistory(index);
  const [expanded, setExpanded] = useState(false);
  if (!data?.referendum) return null;
  const tally = data.referendum.finalTally;
  const votes = data.votes;
  if (!tally && votes.length === 0) return null;

  const approval = tally
    ? approvalFraction(new BN(tally.ayes), new BN(tally.nays))
    : null;
  const shown = expanded ? votes : votes.slice(0, 10);

  return (
    <>
      {tally && (
        <section className="panel p-4">
          <h2 className="label-serif mb-2">Final tally</h2>
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-muted">Aye</span>
            <span className="tnum text-aye">{formatVara(tally.ayes)} VARA</span>
          </div>
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-muted">Nay</span>
            <span className="tnum text-nay">{formatVara(tally.nays)} VARA</span>
          </div>
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-muted">Approval</span>
            <span className="tnum">{percent(approval)}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-muted">Support</span>
            <span className="tnum">{formatVara(tally.support)} VARA</span>
          </div>
        </section>
      )}

      {votes.length > 0 && (
        <section className="panel p-4">
          <h2 className="label-serif mb-2">
            Votes at finish · {votes.length}
          </h2>
          <div className="space-y-1">
            {shown.map((v) => {
              const { side, amount } = voteAmount(v);
              return (
                <div
                  key={v.voter}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="tnum text-muted" title={v.voter}>
                    {shortAddress(v.voter)}
                  </span>
                  <span
                    className={`tnum ${
                      side === "Aye"
                        ? "text-aye"
                        : side === "Nay"
                          ? "text-nay"
                          : "text-muted"
                    }`}
                  >
                    {side} · {formatVara(amount)}
                    {v.conviction !== null &&
                      ` · ${CONVICTIONS[v.conviction]?.label ?? ""}`}
                  </span>
                </div>
              );
            })}
          </div>
          {votes.length > 10 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-accent-ink hover:underline"
            >
              {expanded ? "Show less" : `Show all ${votes.length}`}
            </button>
          )}
        </section>
      )}
    </>
  );
}
