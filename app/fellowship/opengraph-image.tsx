import { ImageResponse } from "next/og";
import { OpenGraphCard } from "@/components/OpenGraphCard";

export const alt = "VaraGov — Fellowship referenda";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <OpenGraphCard
      title="Fellowship referenda"
      description="Explore proposals considered by Vara Network's ranked collective."
      eyebrow="Vara Network · Ranked collective"
      badge="Fellowship"
    />,
    size,
  );
}
