// app/explore/page.tsx
import type { Metadata } from "next";
import ExplorePage from "@/components/explore/explore-page";

/**
 * SEO for /explore
 * Uses metadataBase from your root layout, so relative URLs resolve correctly.
 */
export const metadata: Metadata = {
  title: "Explore NFTs — Trending, New Mints & Auctions | Panthart",
  description:
    "Browse trending NFT collections, live auctions, and new mints on Panthart. Filter by price, volume, traits, and more across the Electroneum ecosystem.",
  keywords: [
    "Panthart",
    "Explore NFTs",
    "NFT marketplace",
    "Electroneum",
    "ETN",
    "Web3",
    "NFT auctions",
    "minting now",
    "trending collections",
  ],
  alternates: {
    canonical: "/explore",
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Explore NFTs | Panthart",
    description:
      "Discover trending collections, live auctions, and new mints on Panthart.",
    url: "/explore",
    siteName: "Panthart",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Panthart — Explore NFTs",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore NFTs | Panthart",
    description:
      "Discover trending collections, live auctions, and new mints on Panthart.",
    creator: "@decentroneum",
    images: ["/opengraph-image.png"],
  },
  category: "marketplace",
};

export default function Explore() {
  return <ExplorePage />;
}
