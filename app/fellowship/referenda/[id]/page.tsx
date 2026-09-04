"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { CallViewer } from "@/components/CallViewer";
import { GovernanceNav } from "@/components/GovernanceNav";
import { StatusPill, TallyBar, TrackBadge } from "@/components/referenda";
import {
  useDecodedCall,
  useFellowshipReferendum,
  useFellowshipTracks,
} from "@/lib/chain/hooks";
import { shortAddress } from "@/lib/chain/format";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tnum min-w-0 text-right text-xs text-ink">{children}</dd>
    </div>
  );
}

export default function FellowshipReferendumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const index = Number(id);
  const { data: referendum, isPending, error } = useFellowshipReferendum(index);
  const tracks = useFellowshipTracks();
  const track = tracks?.find((candidate) => candidate.id === referendum?.trackId);
  const { data: call } = useDecodedCall(referendum);

  if (!Number.isInteger(index) || index < 0) {
    return <p className="text-muted">Invalid Fellowship referendum index.</p>;
  }

  return (
    <div>
      <GovernanceNav />
      <Link
        href="/fellowship"
        className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Fellowship referenda
      </Link>

      {error ? (
        <div className="panel mt-5 p-6 text-sm text-nay">
          Failed to load Fellowship referendum from RPC: {String(error)}
        </div>
      ) : isPending || !referendum ? (
        <div className="skeleton mt-5 h-64" aria-busy="true" />
      ) : (
        <div className="anim-rise mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="display tnum text-lg text-muted/70">No. {index}</span>
              <StatusPill phase={referendum.phase} />
            </div>
            <h1 className="display mt-3 text-3xl leading-tight font-semibold text-balance sm:text-4xl">
              {track ? `[${track.displayName}] ` : ""}Fellowship referendum #{index}
            </h1>
            <div className="mt-3 flex items-center gap-2 text-sm text-muted">
              <BadgeCheck size={16} className="text-accent-ink" aria-hidden="true" />
              Ranked-collective governance
            </div>

            <section className="panel mt-6 p-4">
              <h2 className="label-serif mb-3">Proposal call</h2>
              {call ? (
                <CallViewer root={call.root} />
              ) : referendum.proposalHash ? (
                <p className="tnum break-all text-xs text-muted">
                  Preimage {referendum.proposalHash}
                  {referendum.proposalLen !== null ? ` (${referendum.proposalLen} bytes)` : ""}
                </p>
              ) : (
                <p className="text-xs text-muted">Proposal call is unavailable.</p>
              )}
            </section>
          </div>

          <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
            <section className="panel p-4">
              <p className="label-serif mb-3">Collective tally</p>
              {referendum.tally ? (
                <>
                  <TallyBar ayes={referendum.tally.ayes} nays={referendum.tally.nays} />
                  <dl className="mt-3">
                    <DetailRow label="Ayes">{referendum.tally.ayes.toString()}</DetailRow>
                    <DetailRow label="Nays">{referendum.tally.nays.toString()}</DetailRow>
                    <DetailRow label="Bare ayes">
                      {referendum.tally.support.toString()}
                    </DetailRow>
                  </dl>
                </>
              ) : (
                <p className="text-xs text-muted">
                  The live tally is no longer stored after completion.
                </p>
              )}
            </section>

            <section className="panel p-4">
              <p className="label-serif mb-2">On-chain record</p>
              <dl>
                <DetailRow label="Track">
                  {track ? <TrackBadge track={track} /> : "Unavailable after completion"}
                </DetailRow>
                <DetailRow label="Submitted">
                  {referendum.submittedAt !== null
                    ? `#${referendum.submittedAt.toLocaleString("en-US")}`
                    : "—"}
                </DetailRow>
                <DetailRow label="Decided">
                  {referendum.decidedAt !== null
                    ? `#${referendum.decidedAt.toLocaleString("en-US")}`
                    : "—"}
                </DetailRow>
                <DetailRow label="Proposer">
                  {referendum.proposer ? (
                    <span title={referendum.proposer}>{shortAddress(referendum.proposer)}</span>
                  ) : (
                    "—"
                  )}
                </DetailRow>
              </dl>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
