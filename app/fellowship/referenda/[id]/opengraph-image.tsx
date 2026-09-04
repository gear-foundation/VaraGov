import { ImageResponse } from "next/og";
import { OpenGraphCard } from "@/components/OpenGraphCard";
import { getFellowshipReferendumShareData } from "@/lib/server/share-metadata";

export const alt = "VaraGov Fellowship referendum";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getFellowshipReferendumShareData(Number(id));
  return new ImageResponse(<OpenGraphCard {...data} />, size);
}
