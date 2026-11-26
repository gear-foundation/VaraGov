"use client";

import { useRef, useState, type ReactNode } from "react";
import { BadgeCheck, ChevronDown, CircleAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { blake2AsHex } from "@polkadot/util-crypto";
import { useApi } from "@/lib/chain/ApiProvider";
import { useWallet } from "@/lib/chain/wallet";
import { isTxPending, TX_LABEL, useSendTx } from "@/lib/chain/tx";
import { sameAccount } from "@/lib/chain/address";
import { canClaim, type TreasurySpend } from "@/lib/chain/treasury-spend";
import { parseVaraAmount } from "@/lib/chain/amount";
import { useTreasury, useTreasuryHistory } from "@/lib/chain/treasury-hooks";
import { enactmentBlock, nextReferendumStage } from "@/lib/chain/referendum-timing";
import { dateLabel, estimatedDate, estimatedEraDate } from "@/lib/chain/chain-clock";
import { proposalSummary, type ProposedSpend } from "@/lib/chain/treasury";
import type { TreasurySnapshot } from "@/lib/server/treasury";
import type { RefContent } from "@/lib/content";
import type { Referendum, DecodedCall } from "@/lib/chain/referenda";
import type { TrackInfo } from "@/lib/chain/tracks";
import type { ReferendumOutlook } from "@/lib/chain/referendum-outlook";
import { CallViewer } from "./CallViewer";
import { ExplorerAccount, LedgerAmount, Money, QuoteSource, freshQuote, useVaraPrice, type Quote } from "./TreasuryValues";

function PayoutButton({ spend, snapshot }: { spend: TreasurySpend; snapshot: TreasurySnapshot }) {
  const { api, connected } = useApi();
  const { account } = useWallet();
  const { status, send } = useSendTx();
  const queries = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  if (!sameAccount(account?.address, spend.beneficiary) || !canClaim(spend, snapshot.clock.block) || BigInt(snapshot.free) < BigInt(spend.amount)) return null;
  return <div className="mt-2">
    <button type="button" className="btn btn-primary" disabled={!connected || !api || isTxPending(status) || status.state === "finalized"}
      onClick={async () => {
        if (!api || !connected || inFlight.current) return;
        inFlight.current = true;
        setError(null);
        try {
          const response = await fetch("/api/treasury?fresh=1", { cache: "no-store" });
          if (!response.ok) throw new Error("Snapshot unavailable");
          const latest: TreasurySnapshot = await response.json();
          const match = latest.spends.find((item) => item.index === spend.index);
          if (!match || !canClaim(match, latest.clock.block) || match.amount !== spend.amount ||
              !sameAccount(match.beneficiary, account?.address) || BigInt(latest.free) < BigInt(match.amount)) {
            setError("The spend is no longer ready for payout. The treasury state was refreshed.");
            return;
          }
          await send(api.tx.treasury.payout(spend.index));
        } catch {
          setError("Could not verify the payout. Try again after refreshing treasury data.");
        } finally {
          inFlight.current = false;
          await Promise.all([
            queries.invalidateQueries({ queryKey: ["treasury"] }),
            queries.invalidateQueries({ queryKey: ["treasury-history"] }),
          ]);
        }
      }}>{isTxPending(status) ? TX_LABEL[status.state] : status.state === "finalized" ? "Payout finalized" : "Claim payout"}</button>
    {(error || status.state === "error") && <p className="mt-1 text-nay" role="alert">{error ?? (status.state === "error" ? status.message : "")}</p>}
  </div>;
}

function Funding({ item, treasury, quote, expectedEnactment }: { item: ProposedSpend; treasury: TreasurySnapshot; quote?: Quote; expectedEnactment: number | null }) {
  const amount = BigInt(item.amount);
  const free = BigInt(treasury.free);
  const committed = BigInt(treasury.remaining);
  const available = committed > BigInt(0) ? committed : BigInt(0);
  const pool = treasury.pool;
  let running = available;
  const unlocking = pool?.unlocking.filter((entry) => entry.amount !== null).sort((a, b) => a.era - b.era) ?? [];
  let covers: (typeof unlocking)[number] | undefined;
  for (const entry of unlocking) {
    running += BigInt(entry.amount!);
    if (running >= amount) { covers = entry; break; }
  }
  const expectedStart = expectedEnactment === null ? null : Math.max(expectedEnactment, item.validFrom ?? 0);
  const enactmentDate = estimatedDate(treasury.clock, expectedStart);
  const unlockDate = covers && pool ? covers.ready ? new Date(treasury.clock.timestamp)
    : estimatedEraDate(treasury.clock, covers.era, pool) : null;
  const payoutDate = enactmentDate && (amount <= available || unlockDate)
    ? new Date(Math.max(enactmentDate.getTime(), unlockDate?.getTime() ?? 0)) : null;
  const deadline = expectedStart === null ? null : estimatedDate(treasury.clock, expectedStart + treasury.payoutPeriod);
  return <div className="mt-2 space-y-1 text-sm">
    <p>Liquid treasury balance · <Money amount={free.toString()} quote={quote} />. Available after existing commitments · <Money amount={available.toString()} quote={quote} />.</p>
    {amount > available && <p className="text-muted">
      Additional funding needed · <Money amount={(amount - available).toString()} quote={quote} />.
      {covers && pool ? covers.ready ? " Existing pool funds can be withdrawn now."
        : ` Current withdrawals may cover the gap around ${dateLabel(estimatedEraDate(treasury.clock, covers.era, pool))}.`
        : " No sufficient withdrawal is confirmed."}
    </p>}
    {payoutDate && (!deadline || payoutDate < deadline)
      ? <p>Earliest estimated payout · {dateLabel(payoutDate)} if funds remain available and a payout is submitted.</p>
      : <p className="text-muted">A payout date cannot be estimated from the current voting and funding state.</p>}
    {deadline && <p className="text-muted">Estimated payout deadline · {dateLabel(deadline)}.</p>}
  </div>;
}

export function ReferendumTreasury({ referendum, track, outlook, call, anchor, content, historicalTiming, conditions, application }: {
  referendum: Referendum; track?: TrackInfo; outlook: ReferendumOutlook; call?: DecodedCall;
  anchor?: string | null; content?: RefContent;
  conditions: ReactNode; application: ReactNode;
  historicalTiming?: { submittedAt: number | null; decidingSince: number | null } | null;
}) {
  const summary = proposalSummary(call?.root, track?.name);
  const { data: treasury } = useTreasury();
  const history = useTreasuryHistory(referendum.index);
  const quote = freshQuote(useVaraPrice());
  const clock = treasury?.clock;
  const events = history.data?.events ?? [];
  const recent = clock ? events.filter((event) => event.kind === "VoteCast" && clock.timestamp - Date.parse(event.timestamp) <= 172_800_000) : [];
  const results = events.filter((event) => ["NestedFailure", "ExecutionFailed", "Executed"].includes(event.kind));
  const approved = events.filter((event) => event.kind === "AssetSpendApproved");
  const markdown = content?.contentMd ?? "";
  const claimedAmount = markdown.match(/^\*\*Requested amount:\*\* ([\d.,]+) VARA[ \t]*$/mi)?.[1]?.replace(/,/g, "");
  const claimedRecipient = markdown.match(/^\*\*Beneficiary:\*\* (\S+)\s*$/m)?.[1];
  const parsed = claimedAmount ? parseVaraAmount(claimedAmount) : null;
  const soleSpend = summary.spends.length === 1 ? summary.spends[0] : null;
  const mismatch = soleSpend && (claimedAmount || claimedRecipient) &&
    ((claimedAmount && (parsed?.ok !== true || parsed.planck.toString() !== soleSpend.amount)) ||
      (claimedRecipient && !sameAccount(claimedRecipient, soleSpend.beneficiary)));
  const verifiedMetadata = !!content?.metadataHash && !!anchor && content.metadataHash.toLowerCase() === anchor.toLowerCase();
  const remark = call?.root.args.find((arg) => arg.name === "remark")?.value;
  const expectedRemark = content?.title && content.contentMd != null
    ? `VaraGov:${blake2AsHex(`${content.title}\n${content.contentMd}`, 256)}`
    : null;
  const remarkMatches = expectedRemark !== null && (remark === expectedRemark ||
    remark === `0x${Array.from(new TextEncoder().encode(expectedRemark), (b) => b.toString(16).padStart(2, "0")).join("")}`);
  const submitted = referendum.submittedAt ?? historicalTiming?.submittedAt;
  const deciding = referendum.decidingSince ?? historicalTiming?.decidingSince ?? null;
  const estimated = (block?: number | null) => block == null ? "Pending" : `#${block.toLocaleString()}${estimatedDate(clock, block) ? ` · ~${dateLabel(estimatedDate(clock, block))}` : ""}`;
  const next = nextReferendumStage(referendum, track, outlook);
  const enactment = enactmentBlock(referendum, track, outlook.approvalBlock);
  return <>
    {mismatch && <p role="alert" className="panel border-nay p-4 text-nay">The application’s amount or beneficiary differs from the on-chain call. Review the call before voting.</p>}
    <section className="panel p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="display text-xl font-semibold">What will execute</h2>
        {summary.kind && <span className="label-serif">{summary.kind}</span>}
      </div>
      {(summary.complex || summary.incomplete) && <div className="mb-3 flex gap-2 rounded-md border border-warn/30 bg-warn/8 p-3 text-sm text-warn">
        <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
        <div>
          {summary.complex && <p>This proposal wraps other calls or uses a privileged origin. Review each action and its origin.</p>}
          {summary.incomplete && <p>Some call data could not be resolved.</p>}
        </div>
      </div>}
      {summary.kind === "Text proposal" && <p className="text-sm text-muted">Records the proposal on chain without transferring funds.</p>}
      {summary.spends.length > 0 && <div className="mb-3 space-y-3">
        {summary.spends.map((spend, i) => <div key={i} className="grid items-center gap-3 rounded-md border border-line bg-surface-2 p-3 sm:grid-cols-2 sm:p-4">
          <div><p className="label-serif">{spend.legacy ? "Legacy transfer" : "Requested spend"}</p>
            <LedgerAmount amount={spend.amount} quote={quote} className="mt-1 text-2xl" />
          </div>
          <div className="min-w-0"><p className="label-serif">Recipient</p><p className="mt-1 text-sm"><ExplorerAccount address={spend.beneficiary} /></p>
            {spend.validFrom !== null && <p className="mt-1 text-xs text-muted">Payable from {estimated(spend.validFrom)}</p>}
          </div>
        </div>)}
        <QuoteSource quote={quote} />
      </div>}
      <div className="mt-3 text-sm" aria-live="polite">
        {results.some((event) => event.kind === "NestedFailure") ? <ul className="text-nay">
          {results.filter((event) => event.kind === "NestedFailure").map((event) => <li key={`${event.block}:${event.ordinal}`}>Nested call failed · {event.data.join(" · ")}</li>)}
        </ul> : results.some((event) => event.kind === "ExecutionFailed") ? <p className="text-nay">Enactment failed.</p>
          : results.some((event) => event.kind === "Executed") ? <p className="inline-flex items-center gap-1.5 text-aye"><BadgeCheck size={16} aria-hidden /> Execution recorded on chain.</p>
          : referendum.phase === "approved" ? <p className="text-muted">{history.isError ? "Execution history unavailable." : "Approved · execution result has not been verified."}</p> : null}
      </div>
      {call && <details open={summary.complex || (summary.spends.length === 0 && summary.kind !== "Text proposal") ? true : undefined}
        className="group mt-3 border-t border-line pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronDown size={16} className="group-open:rotate-180" aria-hidden /> Runtime call details
        </summary>
        <div className="mt-3"><CallViewer root={call.root} /></div>
      </details>}
      {summary.kind === "Text proposal" && markdown && <p className="mt-2 text-xs text-muted">
        {remarkMatches || verifiedMetadata ? "Displayed text matches an on-chain hash." : anchor || expectedRemark ? "Displayed text has no verified matching on-chain hash." : "No on-chain text hash available."}
      </p>}
    </section>
    {conditions}
    <section className="panel p-5 sm:p-6">
      <h2 className="display mb-2 text-xl font-semibold">Timeline</h2>
      <dl className="divide-y divide-line">
        {([
          ["Submitted", submitted, false],
          ["Decision started", deciding, false],
          ...(deciding !== null && track && referendum.decidedAt === null ? [
            ["Earliest decision end", deciding + track.confirmPeriod, true],
            ["Scheduled decision deadline", deciding + track.decisionPeriod, true],
          ] as const : []),
          ...(referendum.decidedAt !== null ? [["Decision recorded", referendum.decidedAt, false]] as const : []),
          ...(next && next.block !== outlook.approvalBlock && next.label !== "Scheduled decision deadline" ? [[next.label, next.block, true]] as const : []),
          ...(outlook.approvalBlock !== null ? [[referendum.confirmingUntil !== null ? "Confirmation ends" : "Estimated approval", outlook.approvalBlock, true]] as const : []),
          ...(enactment !== null ? [["Earliest estimated enactment", enactment, true]] as const : []),
        ] as const).map(([label, block, forecast]) => {
          const date = estimatedDate(clock, block);
          return <div key={label} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 py-2.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto]">
            <span aria-hidden className={`size-1.5 self-center rounded-full ${forecast ? "bg-accent-ink" : "bg-muted/55"}`} />
            <dt className={forecast ? "font-medium text-accent-ink" : "font-medium"}>{label}</dt>
            <dd className="col-start-2 text-xs text-muted tnum sm:col-start-3 sm:text-right">
              {date ? <>≈ {dateLabel(date)} <span className="whitespace-nowrap">· #{block?.toLocaleString()}</span></> : block != null ? `Block #${block.toLocaleString()}` : "Pending" }
            </dd>
          </div>;
        })}
      </dl>
      {referendum.decidedAt === null && <p className="mt-2 text-xs text-muted">Confirmation may extend beyond the scheduled deadline. Dates are estimates based on recent block times.</p>}
    </section>
    {(summary.spends.length > 0 || approved.length > 0) && <section id="payout" className="panel scroll-mt-20 p-5 sm:p-6">
      <h2 className="display mb-3 text-xl font-semibold">Funding and payout</h2>
      {approved.length === 0 && soleSpend && treasury && <Funding item={soleSpend} treasury={treasury} quote={quote} expectedEnactment={enactment} />}
      {approved.length === 0 && <p className="mt-3 rounded-md border border-dashed border-line-strong p-3 text-sm text-muted">
        {referendum.decidedAt === null ? "The treasury can pay only after the proposal passes and the spend is approved on chain."
          : "No linked spend approval has been indexed."}
      </p>}
      {approved.map((event) => {
        const spend = treasury?.spends.find((item) => item.index === event.spendIndex);
        const paid = events.find((item) => item.kind === "Paid" && item.spendIndex === event.spendIndex);
        const voided = events.some((item) => item.kind === "AssetSpendVoided" && item.spendIndex === event.spendIndex);
        const validFrom = Number(event.data[4]);
        const expires = Number(event.data[5]);
        const state = voided ? "Voided" : paid || spend?.status === "attempted" ? "Paid"
          : clock && clock.block >= expires ? "Expired"
          : clock && clock.block < validFrom ? "Awaiting payout window"
          : spend?.status === "unknown" ? "Payment state unavailable"
          : spend && treasury ? BigInt(treasury.free) >= BigInt(spend.amount) ? "Ready for payout" : "Awaiting available funds"
          : "Current status unavailable";
        return <article key={event.spendIndex} className="mt-3 border-t border-line pt-3 text-sm">
          <p>Spend #{event.spendIndex} · {state}</p>
          <p><Money amount={event.data[2]} quote={quote} /> · <ExplorerAccount address={event.data[3]} /></p>
          <p className="text-xs text-muted">Payable from {estimated(validFrom)} · Expires {estimated(expires)}</p>
          {paid?.txHash && <a className="text-accent-ink underline" href={`https://vara.subscan.io/extrinsic/${paid.txHash}`} target="_blank" rel="noreferrer">Payout transaction</a>}
          {!paid && spend && treasury && <PayoutButton spend={spend} snapshot={treasury} />}
        </article>;
      })}
    </section>}
    {application}
    <section className="panel p-4 text-sm">
      <h2 className="label-serif mb-2">Votes in the last 48 hours</h2>
      {recent.map((event) =>
        <p key={`${event.block}:${event.ordinal}`}><ExplorerAccount address={event.data[0]} /> · {event.data[1]} · <Money amount={event.data[2]} quote={quote} /> · {dateLabel(new Date(event.timestamp))}</p>)}
      {recent.length === 0 &&
        <p className="text-muted">{history.isError ? "Vote activity unavailable." : history.isPending ? "Loading vote activity…" : "No votes in the indexed window."}</p>}
      {history.data?.trackingSince && <p className="text-xs text-muted">Indexing coverage starts at block #{history.data.trackingSince.toLocaleString()}.</p>}
    </section>
  </>;
}
