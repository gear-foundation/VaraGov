"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "./ApiProvider";

export type ChainIdentity = {
  display: string;
  verified: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identityData(value: unknown): string | null {
  if (typeof value === "string") return value === "None" ? null : value;
  if (!isRecord(value)) return null;
  const raw = value.Raw ?? value.raw;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function parseChainIdentity(value: unknown): ChainIdentity | null {
  const registration = Array.isArray(value) ? value[0] : value;
  if (!isRecord(registration) || !isRecord(registration.info)) return null;
  const display = identityData(registration.info.display);
  if (!display) return null;

  const judgements = Array.isArray(registration.judgements)
    ? registration.judgements
    : [];
  const verified = judgements.some((entry) => {
    const judgement = Array.isArray(entry) ? entry[1] : entry;
    const normalized = JSON.stringify(judgement).toLowerCase();
    return normalized.includes("reasonable") || normalized.includes("knowngood");
  });
  return { display, verified };
}

export function useChainIdentity(address: string | null | undefined) {
  const { api } = useApi();
  return useQuery({
    queryKey: ["chainIdentity", address],
    queryFn: async (): Promise<ChainIdentity | null> => {
      const identity = await api!.query.identity.identityOf(address!);
      return parseChainIdentity(identity.toHuman());
    },
    enabled: !!api && !!address,
    staleTime: 5 * 60_000,
  });
}
