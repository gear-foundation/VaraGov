import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Token-holder referenda",
  description: "Browse public OpenGov proposals and decisions on Vara Network.",
  alternates: { canonical: "/referenda" },
  openGraph: {
    url: "/referenda",
    title: "Token-holder referenda",
    description: "Browse public OpenGov proposals and decisions on Vara Network.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Token-holder referenda",
    description: "Browse public OpenGov proposals and decisions on Vara Network.",
  },
};

export default function ReferendaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
