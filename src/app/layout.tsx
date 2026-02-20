import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import { PostHogProvider } from "@/components/PostHogProvider";
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

export const metadata: Metadata = {
  title: "Menu Truth | See the Real Cost of Food Delivery",
  description:
    "Discover which restaurants mark up prices on delivery apps. Find places that offer direct ordering and save money on your next meal.",
  keywords: [
    "food delivery",
    "UberEats prices",
    "restaurant markup",
    "delivery app fees",
    "Upper West Side restaurants",
    "NYC food delivery",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${instrumentSerif.variable} antialiased`}
        style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
      >
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
