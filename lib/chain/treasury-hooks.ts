"use client";

import { useQuery } from "@tanstack/react-query";
import type { TreasurySnapshot } from "../server/treasury";
import type { TreasuryEventDto } from "../server/treasury-events";

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Treasury data unavailable");
  return response.json();
}

export function useTreasury(enabled = true) {
  return useQuery({
    queryKey: ["treasury"], queryFn: () => read<TreasurySnapshot>("/api/treasury"),
    enabled, refetchInterval: 12_000, staleTime: 6_000,
  });
}
export function useTreasuryHistory(index?: number) {
  return useQuery({
    queryKey: ["treasury-history", index],
    queryFn: () => read<{ events: TreasuryEventDto[]; trackingSince: number | null; indexedThrough: number | null; rewards: { total: string; month: string; latest: string | null } | null }>(
      index === undefined ? "/api/treasury/history" : `/api/treasury/history?ref=${index}`,
    ),
    refetchInterval: 20_000,
  });
}
