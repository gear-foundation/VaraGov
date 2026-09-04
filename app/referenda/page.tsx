"use client";

import { ReferendaDirectory } from "@/components/ReferendaDirectory";
import { useRefMeta } from "@/lib/content";
import { useReferendaList, useTracks } from "@/lib/chain/hooks";

export default function ReferendaPage() {
  const { data: referenda, isPending, error } = useReferendaList();
  const tracks = useTracks();
  const meta = useRefMeta();

  return (
    <ReferendaDirectory
      kind="token"
      referenda={referenda}
      tracks={tracks}
      meta={meta}
      isPending={isPending}
      error={error}
    />
  );
}
