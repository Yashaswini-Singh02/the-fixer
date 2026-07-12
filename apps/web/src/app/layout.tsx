import type { Metadata, Viewport } from "next";
import { Anton, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Anton — heavy condensed jersey caps: headlines, scoreboard, huge reveal numerals
const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

// Space Grotesk — UI/body with characterful tabular figures for odds & coins
const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Fix",
  description:
    "Watch the match. Bet the segments. Fix your friends. A party game for World Cup nights.",
  applicationName: "The Fix",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Fix",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a130e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${anton.variable} ${grotesk.variable} h-full`}>
      <body className="min-h-full">
        <div className="stage" aria-hidden />
        {children}
      </body>
    </html>
  );
}
