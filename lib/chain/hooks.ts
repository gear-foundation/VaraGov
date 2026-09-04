"use client";

import { useQuery } from "@tanstack/react-query";
import { BN } from "@polkadot/util";
import { useApi } from "./ApiProvider";
import {
  fetchAllFellowshipReferenda,
  fetchAllReferenda,
  decodeProposal,
  parseReferendumInfo,
  type Referendum,
} from "./referenda";
import { getFellowshipTracks, getTracks, type TrackInfo } from "./tracks";

export function useTracks(): TrackInfo[] | undefined {
  const { api } = useApi();
  const { data } = useQuery({
    queryKey: ["tracks"],
    queryFn: () => getTracks(api!),
    enabled: !!api,
    staleTime: Infinity,
  });
  return data;
}

export function useReferendaList() {
  const { api } = useApi();
  return useQuery({
    queryKey: ["referenda"],
    queryFn: () => fetchAllReferenda(api!),
    enabled: !!api,
    refetchInterval: 12_000,
  });
}

export function useFellowshipTracks(): TrackInfo[] | undefined {
  const { api } = useApi();
  const { data } = useQuery({
    queryKey: ["fellowshipTracks"],
    queryFn: () => getFellowshipTracks(api!),
    enabled: !!api,
    staleTime: Infinity,
  });
  return data;
}

export function useFellowshipReferendaList() {
  const { api } = useApi();
  return useQuery({
    queryKey: ["fellowshipReferenda"],
    queryFn: () => fetchAllFellowshipReferenda(api!),
    enabled: !!api,
    refetchInterval: 12_000,
  });
}

export function useReferendum(index: number) {
  const { api } = useApi();
  return useQuery({
    queryKey: ["referendum", index],
    queryFn: async () => {
      const info = await api!.query.referenda.referendumInfoFor(index);
      return parseReferendumInfo(index, info);
    },
    enabled: !!api && Number.isInteger(index),
    refetchInterval: 6_000,
  });
}

export function useFellowshipReferendum(index: number) {
  const { api } = useApi();
  return useQuery({
    queryKey: ["fellowshipReferendum", index],
    queryFn: async () => {
      const info = await api!.query.fellowshipReferenda.referendumInfoFor(index);
      return parseReferendumInfo(index, info);
    },
    enabled: !!api && Number.isInteger(index),
    refetchInterval: 6_000,
  });
}

export function useActiveIssuance(): BN | undefined {
  const { api } = useApi();
  const { data } = useQuery({
    queryKey: ["activeIssuance"],
    queryFn: async () => {
      const [total, inactive] = await Promise.all([
        api!.query.balances.totalIssuance(),
        api!.query.balances.inactiveIssuance(),
      ]);
      return (total as unknown as BN).sub(inactive as unknown as BN);
    },
    enabled: !!api,
    staleTime: 60_000,
  });
  return data as BN | undefined;
}

export function useDecodedCall(ref: Referendum | null | undefined) {
  const { api } = useApi();
  return useQuery({
    queryKey: ["call", ref?.index, ref?.proposalHash, ref?.inlineHex],
    queryFn: () => decodeProposal(api!, ref!),
    enabled: !!api && !!ref && !!(ref.proposalHash || ref.inlineHex),
    staleTime: Infinity,
  });
}
