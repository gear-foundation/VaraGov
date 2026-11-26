"use client";

import BigNumber from "bignumber.js";
import { useQuery } from "@tanstack/react-query";
import { formatVara, DECIMALS } from "@/lib/chain/format";
import { IdentityName } from "./IdentityName";

export type Quote = { usd: number; updatedAt: number };
export function useVaraPrice() {
  return useQuery({
    queryKey: ["vara-usd"],
    queryFn: async (): Promise<Quote> => {
      const response = await fetch("/api/vara-price");
      if (!response.ok) throw new Error("VARA/USD quote unavailable");
      return response.json();
    },
    staleTime: 120_000,
    refetchInterval: 120_000,
  }).data;
}
export function freshQuote(quote: Quote | undefined) {
  return quote && Date.now() - quote.updatedAt <= 600_000 ? quote : undefined;
}
export function amountUsd(amount: string, quote: Quote) {
  return new BigNumber(amount).shiftedBy(-DECIMALS).times(quote.usd);
}
export function Money({ amount, quote }: { amount: string; quote?: Quote }) {
  return <span className="tnum" title={quote ? `CoinGecko · 1 VARA = $${quote.usd} · ${new Date(quote.updatedAt).toLocaleString()}` : undefined}>
    {formatVara(amount, { compact: false })} VARA{quote && ` (≈ $${amountUsd(amount, quote).toFormat(2)})`}
  </span>;
}
export function QuoteSource({ quote }: { quote?: Quote }) {
  return <p className="text-xs text-muted">{quote
    ? `CoinGecko · 1 VARA = $${quote.usd} · ${new Date(quote.updatedAt).toLocaleString()}`
    : "USD quote unavailable. VARA amounts remain available."}</p>;
}
export function ExplorerAccount({ address }: { address: string }) {
  return <a className="text-accent-ink underline decoration-accent/40 underline-offset-2" href={`https://vara.subscan.io/account/${encodeURIComponent(address)}`} target="_blank" rel="noreferrer"><IdentityName address={address} /></a>;
}

export function LedgerAmount({ amount, quote, className = "" }: { amount: string; quote?: Quote; className?: string }) {
  return <span className={`block min-w-0 tnum ${className}`}>
    <span className="block text-ink"><span className="display font-semibold">{formatVara(amount, { compact: false })}</span>{" "}
      <span className="text-[0.64em] font-semibold tracking-wide text-muted">VARA</span></span>
    {quote && <span className="mt-0.5 block text-xs font-normal text-muted">≈ ${amountUsd(amount, quote).toFormat(2)}</span>}
  </span>;
}
