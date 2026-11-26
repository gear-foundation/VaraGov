"use client";

import { useQuery } from "@tanstack/react-query";
import type { DecodedCall, Referendum } from "./referenda";
import { decodeProposal } from "./referenda";
import { enrichSailsMessages } from "./sails-decoder";
import { resolveProgramIdlEntry } from "./idl-registry";
import { useApi } from "./ApiProvider";

export function useTokenProposal(ref: Referendum | null | undefined, enabled = true, enrich = false) {
  const { api } = useApi();
  return useQuery({
    queryKey: ["token-proposal", ref?.index, ref?.decidedAt, ref?.proposalHash, ref?.inlineHex, enrich],
    enabled: enabled && !!ref && (!!api || ref.decidedAt !== null),
    staleTime: ref?.decidedAt === null ? 20_000 : Infinity,
    refetchInterval: ref?.decidedAt === null && enrich ? 15_000 : false,
    queryFn: async (): Promise<{ call: DecodedCall; anchor: string | null; timing?: { submittedAt: number | null; decidingSince: number | null } | null }> => {
      if (!ref) throw new Error("Referendum unavailable");
      if (ref.decidedAt !== null) {
        const response = await fetch(`/api/referenda/${ref.index}/proposal?ended=${ref.decidedAt}`);
        if (!response.ok) throw new Error("Archived proposal unavailable");
        const historical = await response.json();
        if (enrich && historical.call?.root) await enrichSailsMessages(historical.call.root, resolveProgramIdlEntry);
        return historical;
      }
      const [call, anchor] = await Promise.all([
        decodeProposal(api!, ref, enrich),
        enrich ? api!.query.referenda.metadataOf(ref.index) : null,
      ]);
      const hash = anchor?.toJSON();
      return { call, anchor: typeof hash === "string" ? hash : null };
    },
  });
}
