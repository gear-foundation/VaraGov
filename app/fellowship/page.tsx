"use client";

import { ReferendaDirectory } from "@/components/ReferendaDirectory";
import {
  useFellowshipReferendaList,
  useFellowshipTracks,
} from "@/lib/chain/hooks";

export default function FellowshipPage() {
  const { data: referenda, isPending, error } = useFellowshipReferendaList();
  const tracks = useFellowshipTracks();

  return (
    <ReferendaDirectory
      kind="fellowship"
      referenda={referenda}
      tracks={tracks}
      isPending={isPending}
      error={error}
    />
  );
}
