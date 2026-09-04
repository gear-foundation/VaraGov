import { ImageResponse } from "next/og";
import { OpenGraphCard } from "@/components/OpenGraphCard";

export const alt = "VaraGov — Token-holder referenda";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <OpenGraphCard
      title="Token-holder referenda"
      description="Browse public OpenGov proposals and decisions on Vara Network."
      eyebrow="The on-chain parliament of Vara Network"
      badge="Public OpenGov"
    />,
    size,
  );
}
