import type { Metadata, Viewport } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import { PostHogProvider } from "@/components/PostHogProvider";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
});

const siteUrl = getSiteUrl();

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#faf9f6",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "MenuTruth | See what delivery apps add to the menu",
  description:
    "See what delivery apps add to the menu. Compare restaurant prices to Uber Eats and find places you can order directly to save money.",
  keywords: [
    "food delivery",
    "UberEats prices",
    "restaurant markup",
    "delivery app fees",
    "Upper West Side restaurants",
    "NYC food delivery",
    "MenuTruth",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    siteName: "MenuTruth",
    title: "MenuTruth | See what delivery apps add to the menu",
    description:
      "See what delivery apps add to the menu. Compare restaurant prices to Uber Eats and order direct when you can.",
    type: "website",
    locale: "en_US",
    url: siteUrl,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body
        className={`${dmSans.variable} ${instrumentSerif.variable} antialiased`}
        style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
      >
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
