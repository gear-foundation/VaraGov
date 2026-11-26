"use client";

import { freshQuote, useVaraPrice } from "@/components/TreasuryValues";
import { useTreasury } from "@/lib/chain/treasury-hooks";
import { ReferendaDirectory } from "@/components/ReferendaDirectory";
import { useRefMeta } from "@/lib/content";
import { useReferendaList, useTracks } from "@/lib/chain/hooks";

export default function ReferendaPage() {
  const { data: referenda, isPending, error, refetch } = useReferendaList();
  const tracks = useTracks();
  const meta = useRefMeta();
  const quote = freshQuote(useVaraPrice());
  const { data: treasury } = useTreasury();

  return (
    <ReferendaDirectory
      kind="token"
      quote={quote}
      clock={treasury?.clock}
      referenda={referenda}
      tracks={tracks}
      meta={meta}
      isPending={isPending}
      error={error}
      onRetry={() => void refetch()}
    />
  );
}
