import type { Metadata, Viewport } from "next";
import "./globals.css";
import { inter } from "./fonts";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "American Signal Desk";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — Trusted News. A Stronger America.`,
    template: `%s | ${siteName}`,
  },
  description:
    "American Signal Desk delivers breaking news, in-depth analysis and expert insight on U.S. news, politics, world affairs, business, technology and more.",
  applicationName: siteName,
  // Canonical URLs are set per-page. Never inherit an indexable canonical here.
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b1a33",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" className={inter.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
