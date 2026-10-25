"use client";

import { useQuery } from "@tanstack/react-query";
import type { Phase } from "./referenda";

export type FellowshipWhitelistLinks = {
  fellowshipIndex: number;
  proposer: string | null;
  callHash: string | null;
  executions: Array<{ index: number; phase: Phase }>;
};

export function useFellowshipWhitelistLinks(index: number) {
  return useQuery({
    queryKey: ["fellowshipWhitelistLinks", index],
    queryFn: async (): Promise<FellowshipWhitelistLinks> => {
      const response = await fetch(`/api/fellowship/referenda/${index}/links`);
      if (!response.ok) throw new Error("Whitelist link lookup failed");
      return response.json();
    },
    enabled: Number.isInteger(index) && index >= 0,
    staleTime: 60_000,
  });
}
