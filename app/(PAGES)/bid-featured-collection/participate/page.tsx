// app/(PAGES)/bid-featured-collection/participate/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import BidParticipateClient from "@/components/featured/BidParticipateClient";

/* ───────────── SEO ───────────── */
const TITLE = "Participate in the Featured Auction — Place a Bid | Panthart";
const DESCRIPTION =
  "Connect your wallet, verify your collection contract, and place or increase a bid in ETN to win Panthart’s featured slot across the site.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/bid-featured-collection/participate" },
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
  keywords: [
    "Panthart",
    "Featured Auction",
    "Participate",
    "Bid to be featured",
    "NFT Marketplace",
    "Electroneum",
    "ETN",
    "ERC721",
  ],
  openGraph: {
    type: "website",
    url: "/bid-featured-collection/participate",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Panthart — Participate in the Featured Auction",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/opengraph-image.png"],
    site: "@decentroneum",
    creator: "@decentroneum",
  },
  category: "marketplace",
  referrer: "strict-origin-when-cross-origin",
  formatDetection: { telephone: false, email: false, address: false },
};

export default function Page() {
  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Bid to be Featured",
        item: "/bid-featured-collection",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Participate",
        item: "/bid-featured-collection/participate",
      },
    ],
  };

  const jsonLdHowTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to bid in the Panthart Featured Auction",
    description:
      "Connect wallet, verify your collection, and place or increase a bid in ETN to win the featured slot.",
    supply: [{ "@type": "HowToSupply", name: "ETN for bid + gas" }],
    tool: [{ "@type": "HowToTool", name: "Web3 wallet (MetaMask or Rabby)" }],
    step: [
      {
        "@type": "HowToStep",
        name: "Connect wallet",
        url: "/bid-featured-collection/participate#connect",
        text: "Use the Connect Wallet button in the header.",
      },
      {
        "@type": "HowToStep",
        name: "Enter collection contract",
        url: "/bid-featured-collection/participate#collection",
        text: "Paste the contract you want to feature. We verify eligibility automatically.",
      },
      {
        "@type": "HowToStep",
        name: "Enter bid amount",
        url: "/bid-featured-collection/participate#amount",
        text: "Meet or exceed the minimum to take the lead, or add to your existing bid.",
      },
      {
        "@type": "HowToStep",
        name: "Confirm transaction",
        url: "/bid-featured-collection/participate#confirm",
        text: "Confirm in your wallet and wait for on-chain confirmation.",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdHowTo) }}
      />
      <BidParticipateClient />
    </>
  );
}
