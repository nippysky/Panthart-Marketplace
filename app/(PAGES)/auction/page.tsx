// app/auction/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { headers } from "next/headers";
import React from "react";
import AuctioningNowComponent from "@/components/shared/auctionnow-page";

/* ----------------------------------------------------------------------------
 * SEO
 * ---------------------------------------------------------------------------- */
export const metadata: Metadata = {
  title: "Live NFT Auctions | Panthart",
  description:
    "Bid on live NFT auctions on Panthart. Timed auctions, smooth UX, and low fees on Electroneum (ETN).",
  alternates: { canonical: "/auction" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "Live NFT Auctions | Panthart",
    description:
      "Explore and bid on active NFT auctions on the ETN-powered marketplace.",
    url: "/auction",
    siteName: "Panthart",
    type: "website",
    images: ["/opengraph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Live NFT Auctions | Panthart",
    description:
      "Explore and bid on active NFT auctions on the ETN-powered marketplace.",
    images: ["/opengraph-image.png"],
    creator: "@decentroneum",
  },
  keywords: [
    "NFT auctions",
    "Panthart auctions",
    "Electroneum",
    "ETN",
    "Web3",
    "Timed auctions",
    "NFT marketplace",
  ],
  category: "marketplace",
  referrer: "origin-when-cross-origin",
  formatDetection: { email: false, address: false, telephone: false },
};

/* ----------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------- */
async function absoluteUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (base) return `${base}${path}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (host && host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

/* ----------------------------------------------------------------------------
 * Page (Server Component)
 * ---------------------------------------------------------------------------- */
export default async function AuctionsPage() {
  const homeUrl = await absoluteUrl("/");
  const pageUrl = await absoluteUrl("/auction");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Live NFT Auctions",
    description:
      "Browse live NFT auctions on Panthart. Discover trending assets and place competitive bids on Electroneum (ETN).",
    url: pageUrl,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
        { "@type": "ListItem", position: 2, name: "Auctions", item: pageUrl },
      ],
    },
  };

  return (
    <>
      {/* JSON-LD for richer snippets */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AuctioningNowComponent />
    </>
  );
}
