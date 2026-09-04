import { ImageResponse } from "next/og";
import { OpenGraphCard } from "@/components/OpenGraphCard";
import { getTokenReferendumShareData } from "@/lib/server/share-metadata";

export const alt = "VaraGov token-holder referendum";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getTokenReferendumShareData(Number(id));
  return new ImageResponse(<OpenGraphCard {...data} />, size);
}
