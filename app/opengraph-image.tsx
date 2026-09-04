import { ImageResponse } from "next/og";
import { OpenGraphCard } from "@/components/OpenGraphCard";

export const alt = "VaraGov — Open governance for Vara Network";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <OpenGraphCard
      title="Open governance for Vara Network"
      description="Explore proposals, follow decisions and participate in Vara Network governance."
      eyebrow="The on-chain parliament of Vara Network"
      badge="Vara OpenGov"
    />,
    size,
  );
}
