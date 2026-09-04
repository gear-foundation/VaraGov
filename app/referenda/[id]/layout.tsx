import type { Metadata } from "next";
import { getTokenReferendumShareData } from "@/lib/server/share-metadata";

type Props = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const index = Number(id);
  const data = await getTokenReferendumShareData(index);
  const canonical = `/referenda/${id}`;

  return {
    title: data.title,
    description: data.description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      title: data.title,
      description: data.description,
    },
    twitter: {
      card: "summary_large_image",
      title: data.title,
      description: data.description,
    },
  };
}

export default function ReferendumLayout({ children }: Props) {
  return children;
}
