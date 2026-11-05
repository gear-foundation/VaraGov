"use client";

import { ReferendaDirectory } from "@/components/ReferendaDirectory";
import { useRefMeta } from "@/lib/content";
import {
  useFellowshipReferendaList,
  useFellowshipTracks,
} from "@/lib/chain/hooks";

export default function FellowshipPage() {
  const { data: referenda, isPending, error, refetch } = useFellowshipReferendaList();
  const tracks = useFellowshipTracks();
  const meta = useRefMeta("fellowship");

  return (
    <ReferendaDirectory
      kind="fellowship"
      referenda={referenda}
      tracks={tracks}
      meta={meta}
      isPending={isPending}
      error={error}
      onRetry={() => void refetch()}
    />
  );
}
