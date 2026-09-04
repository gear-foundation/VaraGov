import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fellowship referenda",
  description: "Explore proposals considered by Vara Network's ranked collective.",
  alternates: { canonical: "/fellowship" },
  openGraph: {
    url: "/fellowship",
    title: "Fellowship referenda",
    description: "Explore proposals considered by Vara Network's ranked collective.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fellowship referenda",
    description: "Explore proposals considered by Vara Network's ranked collective.",
  },
};

export default function FellowshipLayout({ children }: { children: React.ReactNode }) {
  return children;
}
