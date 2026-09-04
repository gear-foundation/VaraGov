import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://opengov.vara.network"),
  title: {
    default: "VaraGov",
    template: "%s | VaraGov",
  },
  description: "OpenGov governance interface for Vara Network",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "VaraGov",
    title: "VaraGov",
    description: "Open governance for Vara Network",
  },
  twitter: {
    card: "summary_large_image",
    title: "VaraGov",
    description: "Open governance for Vara Network",
  },
};

const themeInit = `try{if(localStorage.theme==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <div className="scene" aria-hidden />
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
