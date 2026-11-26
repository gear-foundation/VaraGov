"use client";

import Link from "next/link";
import BigNumber from "bignumber.js";
import { ArrowRight, ArrowUpRight, Coins, Landmark, ListChecks, ScrollText } from "lucide-react";
import { Guilloche } from "@/components/Guilloche";
import { ErrorNotice } from "@/components/ErrorNotice";
import { ExplorerAccount, LedgerAmount, Money, QuoteSource, freshQuote, useVaraPrice, type Quote } from "@/components/TreasuryValues";
import { dateLabel, estimatedDate, estimatedEraDate } from "@/lib/chain/chain-clock";
import { sameAccount } from "@/lib/chain/address";
import { useTreasury, useTreasuryHistory } from "@/lib/chain/treasury-hooks";
import { SPEND_TRACK_NAMES } from "@/lib/chain/treasury";
import { displayTrackName } from "@/lib/chain/tracks";
import type { TreasuryEventDto } from "@/lib/server/treasury-events";
import type { TreasurySnapshot } from "@/lib/server/treasury";

function TxLink({ hash }: { hash: string | null | undefined }) {
  return hash ? <a className="text-accent-ink underline" href={`https://vara.subscan.io/extrinsic/${hash}`} target="_blank" rel="noreferrer">Transaction</a> : null;
}

function Activity({ event, treasury, quote }: { event: TreasuryEventDto; treasury: TreasurySnapshot; quote?: Quote }) {
  const incoming = event.kind === "Transfer" && sameAccount(event.data[1], treasury.address);
  const title = event.kind === "Transfer" ? incoming ? "Treasury receipt" : "Treasury transfer"
    : event.kind === "PaidOut" ? "Staking rewards received"
      : event.kind.replace(/([a-z])([A-Z])/g, "$1 $2");
  return <li className="flex flex-wrap justify-between gap-2 py-3 text-sm">
    <div>{title}{" "}
      {["Transfer", "PaidOut", "Unbonded", "Withdrawn", "Bonded"].includes(event.kind) && /^\d+$/.test(event.data[2] ?? "") && <Money amount={event.data[2]} quote={quote} />}
      {event.kind === "Transfer" && <> · <ExplorerAccount address={event.data[incoming ? 0 : 1]} /></>}
      {event.kind === "LegacyAwarded" && <> · <Money amount={event.data[1]} quote={quote} /> · <ExplorerAccount address={event.data[2]} /></>}
    </div>
    <div className="flex flex-wrap gap-2 text-xs text-muted">
      {event.refIndex !== null && <Link className="text-accent-ink" href={`/referenda/${event.refIndex}`}>#{event.refIndex}</Link>}
      {dateLabel(new Date(event.timestamp))}<TxLink hash={event.txHash} />
    </div>
  </li>;
}

export default function TreasuryPage() {
  const live = useTreasury();
  const history = useTreasuryHistory();
  const quote = freshQuote(useVaraPrice());
  const treasury = live.data;
  if (live.isError && !treasury) return <ErrorNotice message="Treasury data is unavailable." onRetry={() => void live.refetch()} />;
  if (!treasury) return <div className="skeleton h-64" aria-busy="true" />;

  const { clock, pool, spends, multisig } = treasury;
  const events = history.data?.events ?? [];
  const approval = (index: number) => events.find((event) => event.kind === "AssetSpendApproved" && event.spendIndex === index);
  const lifecycle = (index: number) => events.find((event) => ["Paid", "PaymentFailed", "AssetSpendVoided"].includes(event.kind) && event.spendIndex === index);
  const rewards = history.data?.rewards;
  const operations = events.filter((event) => ["Bonded", "Unbonded", "Withdrawn", "RolesUpdated", "StateChanged", "Nominated"].includes(event.kind));
  const activity = events.filter((event) => ["Transfer", "Paid", "PaidOut", "AssetSpendVoided", "PaymentFailed", "LegacyAwarded"].includes(event.kind));
  const activeSpendCount = spends.filter((spend) => spend.expireAt > clock.block && spend.status !== "attempted").length;

  return <div className="space-y-6 anim-rise">
    <header className="rule-double relative isolate overflow-hidden pb-6">
      <Guilloche className="pointer-events-none absolute -top-40 -right-28 -z-10 size-[24rem] text-accent-ink/45 sm:-top-56 sm:size-[32rem]" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-serif mb-2 inline-flex items-center gap-2"><Landmark size={14} aria-hidden /> Vara Network</p>
          <h1 className="display text-balance text-4xl font-semibold leading-none sm:text-5xl">Community treasury</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <ExplorerAccount address={treasury.address} />
            <span className="inline-flex items-center gap-1.5 tnum">
              <span className={`size-1.5 rounded-full ${live.isError ? "bg-warn" : "live-dot bg-aye"}`} aria-hidden />
              Finalized block #{clock.block.toLocaleString()}
            </span>
          </p>
        </div>
        <Link href="/new?type=treasury" className="btn btn-primary"><Coins size={16} aria-hidden /> Request funding <ArrowRight size={14} aria-hidden /></Link>
      </div>
    </header>
    {live.isError && <ErrorNotice message="The snapshot could not be refreshed." onRetry={() => void live.refetch()} />}
    <section aria-label="Treasury balances" className="panel overflow-hidden">
      <div className="grid lg:grid-cols-[1.15fr_1fr]">
        <div className="min-w-0 border-b border-line bg-accent-soft/40 p-5 sm:p-6 lg:border-r lg:border-b-0">
          <p className="label-serif">Available after commitments</p>
          <LedgerAmount amount={treasury.remaining} quote={quote} className="my-3 text-3xl leading-tight sm:text-4xl" />
          <p className="max-w-sm text-sm text-muted">Liquid funds less approved spending commitments.</p>
        </div>
        <dl className="divide-y divide-line px-5 sm:px-6">
          {[
            ["Liquid balance", treasury.free],
            ["Approved commitments", treasury.obligations],
            ["Staked in pool", pool?.balance],
          ].map(([label, amount]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-right text-lg">{amount === undefined
              ? <span className="text-sm text-muted">{treasury.poolUnavailable ? "Unavailable" : "No pool"}</span>
              : <LedgerAmount amount={amount} quote={quote} />}</dd>
          </div>)}
        </dl>
      </div>
      <footer className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-line px-5 py-3 sm:px-6">
        <QuoteSource quote={quote} />
        <p className="text-xs text-muted">Operating target · 100,000 VARA. Approved spends can use these funds.</p>
      </footer>
    </section>
    <nav aria-label="Treasury sections" className="-mx-1 flex flex-wrap gap-1 border-b border-line px-1 pb-2">
      {[["spends", "Spending"], ["activity", "Activity"], ["staking", "Staking"], ["limits", "Track limits"], ["operations", "Operations"]].map(([id, label]) =>
        <a key={id} href={`#${id}`} className="btn btn-ghost !px-2.5 !py-1.5">{label}</a>)}
    </nav>
    <section id="spends" className="panel scroll-mt-20 p-5 sm:p-6">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="display text-xl font-semibold">Approved spends</h2>
        <span className="text-xs text-muted">{activeSpendCount} open</span>
      </header>
      {spends.length === 0 && <div className="flex items-start gap-3 rounded-md border border-dashed border-line-strong p-4">
        <ListChecks className="mt-0.5 shrink-0 text-accent-ink" size={18} aria-hidden />
        <div>
          <p className="font-medium">No approved spends</p>
          <p className="mt-1 text-sm text-muted">Once a spending proposal passes and executes, its payout window will appear here.</p>
          <Link className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent-ink underline-offset-4 hover:underline" href="/referenda">
            Browse referenda <ArrowUpRight size={14} aria-hidden />
          </Link>
        </div>
      </div>}
      <ul className="divide-y divide-line">{spends.map((spend) => {
        const approved = approval(spend.index);
        const payment = lifecycle(spend.index);
        const status = payment?.kind === "Paid" || spend.status === "attempted" ? "Paid"
          : spend.status === "unknown" ? "Payment state unavailable"
          : clock.block >= spend.expireAt ? "Expired" : clock.block < spend.validFrom ? "Not yet payable"
          : BigInt(treasury.free) >= BigInt(spend.amount) ? "Ready for payout"
          : pool?.unlocking.some((item) => item.amount && BigInt(item.amount) > BigInt(0)) ? "Waiting for funds from the pool" : "Insufficient liquid funds";
        const tone = status === "Paid" || status === "Ready for payout" ? "text-aye" : status === "Expired" ? "text-nay" : "text-warn";
        return <li key={spend.index} className="grid gap-3 py-4 text-sm sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <LedgerAmount amount={spend.amount} quote={quote} className="text-xl" />
            <p>To <ExplorerAccount address={spend.beneficiary} /></p>
            <p className="text-xs text-muted">Spend #{spend.index}{approved?.refIndex != null && <> · <Link className="text-accent-ink underline" href={`/referenda/${approved.refIndex}`}>Referendum #{approved.refIndex}</Link></>}</p>
          </div>
          <div className="space-y-1 sm:text-right">
            <p className={`font-semibold ${tone}`}>{status}</p>
            <p className="text-xs text-muted" title={`Block #${spend.validFrom}`}>Opens · {estimatedDate(clock, spend.validFrom) ? `≈ ${dateLabel(estimatedDate(clock, spend.validFrom))}` : `#${spend.validFrom}`}</p>
            <p className="text-xs text-muted" title={`Block #${spend.expireAt}`}>Expires · {estimatedDate(clock, spend.expireAt) ? `≈ ${dateLabel(estimatedDate(clock, spend.expireAt))}` : `#${spend.expireAt}`}</p>
            <TxLink hash={payment?.txHash} />
          </div>
        </li>;
      })}</ul>
    </section>
    <section id="activity" className="panel scroll-mt-20 p-5 sm:p-6">
      <h2 className="display mb-3 text-xl font-semibold">Treasury activity</h2>
      {history.isError ? <ErrorNotice message="Treasury activity is unavailable." onRetry={() => void history.refetch()} /> :
        <p className="text-xs text-muted">{history.data?.trackingSince ? `Indexed blocks #${history.data.trackingSince.toLocaleString()}–#${history.data.indexedThrough?.toLocaleString()}` : null}</p>}
      {!history.isError && activity.length === 0 && <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        <ScrollText size={16} aria-hidden /> {history.isPending ? "Loading the activity ledger…" : history.data?.trackingSince ? "No transactions in the indexed history." : "Activity will appear when the worker finishes indexing its first block."}
      </p>}
      <ul className="mt-2 divide-y divide-line">{activity.map((event) =>
        event.kind === "Paid" ? <li className="py-3 text-sm" key={`${event.block}:${event.ordinal}`}>
          Paid spend #{event.spendIndex}{event.spendIndex !== null && (() => {
            const record = approval(event.spendIndex);
            return record && <> · <Money amount={record.data[2]} quote={quote} /> · <ExplorerAccount address={record.data[3]} />
              {record.refIndex !== null && <> · <Link href={`/referenda/${record.refIndex}`}>Referendum #{record.refIndex}</Link></>}</>;
          })()} · {dateLabel(new Date(event.timestamp))} <TxLink hash={event.txHash} />
        </li> : <Activity key={`${event.block}:${event.ordinal}`} event={event} treasury={treasury} quote={quote} />)}</ul>
    </section>
    <section id="staking" className="panel scroll-mt-20 p-5 sm:p-6">
      <h2 className="display mb-3 text-xl font-semibold">Treasury staking pool</h2>
      {pool ? <div className="space-y-3 text-sm">
        <p>Pool #{pool.id} · {pool.state} · {pool.members} member(s)</p>
        <p className="text-muted">Reward claim permission · {pool.claimPermission}</p>
        {pool.roles && <dl>{Object.entries(pool.roles).map(([role, address]) => <div key={role} className="flex gap-2"><dt className="capitalize text-muted">{role}</dt><dd>{typeof address === "string" ? <ExplorerAccount address={address} /> : "—"}</dd></div>)}</dl>}
        <div><h3 className="font-medium">Funds unlocking</h3>
          {pool.unlocking.length ? <ul>{pool.unlocking.map((item) => <li key={item.era}>
            {item.amount === null ? "Amount unavailable" : <Money amount={item.amount} quote={quote} />} · Era {item.era} · {item.ready ? "Ready to withdraw" : `Estimated ${dateLabel(estimatedEraDate(clock, item.era, pool))}`}
          </li>)}</ul> : <p className="text-muted">No scheduled withdrawals.</p>}
        </div>
        <div><h3 className="font-medium">Nominated validators</h3>
          {pool.validators.length ? <ul>{pool.validators.map((validator) => {
            const offline = events.find((event) => event.kind === "ValidatorsOffline" && event.data.some((address) => sameAccount(address, validator.address)));
            const slash = events.find((event) => event.kind === "ValidatorSlashed" && sameAccount(event.data[0], validator.address));
            return <li key={validator.address}><ExplorerAccount address={validator.address} /> · {validator.commission}% commission · {validator.active ? "In active set" : "Outside active set"}
              {offline && <> · Offline reported {dateLabel(new Date(offline.timestamp))}</>}
              {slash && <> · Slashed {dateLabel(new Date(slash.timestamp))}</>}
            </li>;
          })}</ul>
            : <p className="text-muted">No nominations recorded.</p>}
        </div>
        {pool.pendingRewards !== null && <p>Pending rewards · <Money amount={pool.pendingRewards} quote={quote} /></p>}
        {rewards && history.data?.trackingSince && <>
          <p>Rewards claimed in last 30 days (indexed) · <Money amount={rewards.month} quote={quote} /></p>
          <p>Rewards claimed since coverage began · <Money amount={rewards.total} quote={quote} /></p>
          {rewards.latest && <p>Most recent indexed reward claim · {dateLabel(new Date(rewards.latest))}</p>}
        </>}
      </div> : <p className="text-sm text-muted">{treasury.poolUnavailable ? "Pool data unavailable." : "The treasury does not currently belong to a pool."}</p>}
    </section>
    <section id="operations" className="panel scroll-mt-20 p-5 sm:p-6">
      <h2 className="display mb-3 text-xl font-semibold">Operations multisig</h2>
      {multisig ? <div className="space-y-2 text-sm">
        <p>{multisig.threshold} of {multisig.signers.length} · <ExplorerAccount address={multisig.address} /></p>
        <ul>{multisig.signers.map((address) => <li key={address}><ExplorerAccount address={address} /></li>)}</ul>
        <p>Starts withdrawals, returns unlocked funds to the treasury, adds funds to the pool and nominates validators. Grant recipients are decided by referendum.</p>
      </div> : <p className="text-sm text-muted">Multisig membership has not been configured.</p>}
      {pool?.proxies.map((proxy) => <p key={`${proxy.delegate}-${proxy.proxyType}`} className="text-sm"><ExplorerAccount address={proxy.delegate} /> · {proxy.proxyType}</p>)}
      {operations.length > 0 && <ul className="mt-3 divide-y divide-line">{operations.map((event) => <li key={`${event.block}:${event.ordinal}`} className="py-2 text-sm">
        {event.kind} · {event.refIndex !== null ? <Link href={`/referenda/${event.refIndex}`}>Referendum #{event.refIndex}</Link> : <span className="text-nay">No verified referendum link</span>} · {dateLabel(new Date(event.timestamp))} <TxLink hash={event.txHash} />
        {event.kind === "Nominated" && <ul className="mt-1 pl-3">{event.data.map((address) => <li key={address}><ExplorerAccount address={address} /></li>)}</ul>}
      </li>)}</ul>}
    </section>
    <section className="panel p-5 sm:p-6">
      <h2 className="display mb-3 text-xl font-semibold">Validators and infrastructure</h2>
      <p className="text-sm">{treasury.infrastructure ? <>
        ${treasury.infrastructure.usd.toLocaleString()} planned
        {quote && <> (≈ {new BigNumber(treasury.infrastructure.usd).div(quote.usd).toFormat(0)} VARA)</>}
        {" · "}{treasury.infrastructure.due}
      </> : "Funding estimate and deadline have not been configured."}</p>
    </section>
    <section id="limits" className="panel scroll-mt-20 p-5 sm:p-6">
      <h2 className="display mb-2 text-xl font-semibold">Track limits</h2>
      <p className="mb-4 text-sm text-muted">Spending caps apply to one proposal. Required support is measured at the end of the decision period.</p>
      <ul className="divide-y divide-line">
        <li aria-hidden className="label-serif hidden gap-4 pb-2 sm:grid sm:grid-cols-[1fr_1fr_1fr]"><span>Track</span><span>Spending cap</span><span>Minimum support</span></li>
        {[...SPEND_TRACK_NAMES, "root"].map((track) => <li key={track} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_1fr_1fr] sm:gap-4">
          <h3 className="font-medium">{displayTrackName(track)}</h3>
          <dl className="grid grid-cols-2 gap-2 sm:col-span-2 sm:gap-4">
            <div className="min-w-0">
              <dt className="text-xs text-muted sm:sr-only">Spending cap</dt>
              <dd>{treasury.limits?.[track] ? <LedgerAmount amount={treasury.limits[track]} quote={quote} /> : track === "root" ? "No track cap" : "Unavailable"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted sm:sr-only">Minimum support</dt>
              <dd>{treasury.support[track] ? <LedgerAmount amount={treasury.support[track]} quote={quote} /> : "Unavailable"}</dd>
            </div>
          </dl>
        </li>)}
      </ul>
    </section>
  </div>;
}
