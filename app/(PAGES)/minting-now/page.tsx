// app/minting-now/page.tsx
import type { Metadata } from "next";
import MintingNowPageComponent from "@/components/shared/mintnow-page";

/**
 * SEO for /minting-now
 * Inherits metadataBase from your root layout, so relative URLs resolve correctly.
 */
export const metadata: Metadata = {
  title: "Minting Now — Live NFT Drops & Presales | Panthart",
  description:
    "See live NFT mints happening right now on Panthart. Track presales and public sales, prices, supply, and time left across the Electroneum (ETN) ecosystem.",
  keywords: [
    "Panthart",
    "Minting now",
    "Live NFT mints",
    "NFT drops",
    "Presale",
    "Allowlist",
    "Public sale",
    "Electroneum",
    "ETN",
    "Web3",
  ],
  alternates: {
    canonical: "/minting-now",
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
    title: "Minting Now | Panthart",
    description:
      "Live NFT drops, presales, and public mints across the Electroneum (ETN) ecosystem.",
    url: "/minting-now",
    siteName: "Panthart",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Panthart — Minting Now",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Minting Now | Panthart",
    description:
      "Explore live NFT drops and presales on Panthart powered by Electroneum (ETN).",
    creator: "@decentroneum",
    images: ["/opengraph-image.png"],
  },
  category: "marketplace",
};

export default function MintingNowPage() {
  // Server component; data fetching is inside MintingNowPageComponent
  return <MintingNowPageComponent />;
}
