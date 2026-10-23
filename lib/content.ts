"use client";

import { useQuery } from "@tanstack/react-query";
import { stringToHex } from "@polkadot/util";
import type { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";
import { buildPayloadJson, type SimaPayload } from "./sima";
import { humanizeApiError, humanizeHttpError, humanizeTxError } from "./chain/errors";

export type RefMeta = {
  title: string | null;
  trackId: number | null;
  blob: string; // lowercase title + description, for the quick filter
};

export function useRefMeta(): Map<number, RefMeta> | undefined {
  const { data } = useQuery({
    queryKey: ["titles"],
    queryFn: async () => {
      const res = await fetch("/api/content");
      if (!res.ok) throw new Error("Could not load referendum titles.");
      const json = await res.json();
      return new Map<number, RefMeta>(
        (json.titles as ({ index: number } & RefMeta)[]).map((t) => [
          t.index,
          { title: t.title, trackId: t.trackId, blob: t.blob ?? "" },
        ]),
      );
    },
    staleTime: 30_000,
  });
  return data;
}

export type RefContent = {
  index: number;
  title: string | null;
  contentMd: string | null;
  proposer: string | null;
  metadataHash: string | null;
} | null;

export function useContent(index: number) {
  return useQuery({
    queryKey: ["content", index],
    queryFn: async (): Promise<RefContent> => {
      const res = await fetch(`/api/content/${index}`);
      if (!res.ok) throw new Error("Could not load referendum content.");
      const json = await res.json();
      return json.content ?? null;
    },
    staleTime: 15_000,
  });
}

export type CommentDto = {
  id: string;
  author: string;
  contentMd: string;
  replyToId: string | null;
  createdAt: string;
  editedAt: string | null;
};

export function useComments(index: number) {
  return useQuery({
    queryKey: ["comments", index],
    queryFn: async (): Promise<CommentDto[]> => {
      const res = await fetch(`/api/comments/${index}`);
      if (!res.ok) throw new Error("Could not load comments.");
      const json = await res.json();
      return json.comments ?? [];
    },
    refetchInterval: 30_000,
  });
}

// Sign a SIMA payload with the wallet's raw signer and POST it.
export async function signAndPost(
  url: string,
  payload: SimaPayload,
  account: InjectedAccountWithMeta,
): Promise<
  | { ok: true; contentHash?: string; id?: string; payloadHex: string }
  | { ok: false; error: string }
> {
  const payloadJson = buildPayloadJson(payload);
  const payloadHex = stringToHex(payloadJson);
  try {
    const { web3FromSource } = await import("@polkadot/extension-dapp");
    const injector = await web3FromSource(account.meta.source);
    if (!injector.signer.signRaw) {
      return {
        ok: false,
        error: "This wallet cannot sign messages (signRaw unsupported — e.g. Ledger).",
      };
    }
    const { signature } = await injector.signer.signRaw({
      address: account.address,
      data: payloadHex,
      type: "bytes",
    });
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payloadJson, address: account.address, signature }),
      });
    } catch {
      return { ok: false, error: humanizeHttpError() };
    }
    const json = await res.json().catch(() => null);
    if (!json || typeof json !== "object") {
      return { ok: false, error: humanizeApiError(undefined, 500) };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: humanizeApiError("error" in json ? json.error : undefined, res.status),
      };
    }
    return { ok: true, ...json, payloadHex };
  } catch (e) {
    return { ok: false, error: humanizeTxError(e) };
  }
}
