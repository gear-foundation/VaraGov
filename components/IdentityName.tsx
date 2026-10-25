"use client";

import { BadgeCheck } from "lucide-react";
import { useChainIdentity } from "@/lib/chain/identity";
import { shortAddress } from "@/lib/chain/format";

export function IdentityName({ address }: { address: string }) {
  const { data: identity } = useChainIdentity(address);
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5"
      title={`${identity?.display ?? shortAddress(address)} · ${address}`}
    >
      {identity?.verified && (
        <BadgeCheck size={14} className="shrink-0 text-aye" aria-label="Verified identity" />
      )}
      <span className={identity ? "truncate font-medium text-ink" : "tnum truncate"}>
        {identity?.display ?? shortAddress(address)}
      </span>
    </span>
  );
}
