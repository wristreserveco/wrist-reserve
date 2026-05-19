import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import { ViewTransitions } from "next-view-transitions";
import { CartProvider } from "@/components/providers/CartProvider";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ChatWidget } from "@/components/ChatWidget";

const SiteAnalytics = dynamic(
  () =>
    import("@/components/providers/SiteAnalytics").then((m) => ({
      default: m.SiteAnalytics,
    })),
  { ssr: false }
);

const display = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600"],
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.startsWith("http") === true
    ? process.env.NEXT_PUBLIC_SITE_URL
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Wrist Reserve | Affordable Luxury Timepieces",
    template: "%s | Wrist Reserve",
  },
  description:
    "A minimal luxury destination for affordable timepieces — fast checkout, insured worldwide shipping, concierge support.",
  applicationName: "Wrist Reserve",
  keywords: [
    "luxury watches",
    "rolex",
    "patek philippe",
    "audemars piguet",
    "richard mille",
    "pre-owned watches",
    "wristwatch reserve",
  ],
  authors: [{ name: "Wrist Reserve" }],
  // Open Graph defaults — overridden per-page when a richer card is needed.
  openGraph: {
    type: "website",
    siteName: "Wrist Reserve",
    title: "Wrist Reserve — Affordable Luxury Timepieces",
    description:
      "A minimal luxury destination for affordable timepieces. Fast, encrypted checkout. Insured worldwide shipping. Concierge support.",
    url: siteUrl,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wrist Reserve — Affordable Luxury Timepieces",
    description:
      "Fast, encrypted checkout. Insured worldwide shipping. Concierge support.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  // PWA manifest — see /src/app/manifest.ts
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Organization-level JSON-LD. Populates Google's Knowledge Panel and
  // social link-share previews with brand-grade metadata.
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Wrist Reserve",
    alternateName: "WristReserve.co",
    url: siteUrl,
    description:
      "A minimal luxury destination for affordable timepieces. Fast, encrypted checkout. Insured worldwide shipping.",
    sameAs: [] as string[], // populate with social profile URLs once they exist
  };
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Wrist Reserve",
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/shop?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    // <ViewTransitions> wraps router transitions in the browser's native
    // View Transitions API when available. Browsers without support fall
    // back to instant navigation — zero impact, zero JS sent in fallback.
    <ViewTransitions>
      <html lang="en" className="dark">
        <body
          className={`${display.variable} ${sans.variable} min-h-screen bg-black font-sans text-white antialiased`}
        >
          {/* Site-wide structured data — added with `dangerouslySetInnerHTML`
              because Next.js's <script> renders the JSON as a child node, which
              can break Google's parser. This pattern is the documented norm. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(organizationJsonLd),
            }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
          />
          <CartProvider>
            <Suspense fallback={null}>
              <SiteAnalytics />
            </Suspense>
            <Navbar />
            <main className="min-h-[60vh]">{children}</main>
            <Footer />
            <ChatWidget />
          </CartProvider>
        </body>
      </html>
    </ViewTransitions>
  );
}
