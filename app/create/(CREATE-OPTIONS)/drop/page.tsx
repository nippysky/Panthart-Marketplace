// app/create/drop/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Header from "@/components/shared/header";
import DropWizard from "@/components/drop/drop-wizard";

/* ───────────── SEO ───────────── */
const TITLE = "Create ERC-721 Drop — Launch a Collection | Panthart";
const DESCRIPTION =
  "Deploy an ERC-721 Drop on Electroneum (ETN). Name your collection, set supply, royalties, and mint price—then launch with our guided wizard.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/create/drop" },
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
    "Create Drop",
    "ERC-721 Drop",
    "NFT Drop",
    "Launch Collection",
    "Electroneum",
    "ETN",
    "Royalties",
    "Mint Price",
    "Web3",
  ],
  openGraph: {
    type: "website",
    url: "/create/drop",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Panthart — Create ERC-721 Drop",
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

export default async function DropCreatePage() {
  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Create", item: "/create" },
      {
        "@type": "ListItem",
        position: 3,
        name: "ERC-721 Drop",
        item: "/create/drop",
      },
    ],
  };

  const jsonLdHowTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to create an ERC-721 Drop on Panthart",
    description:
      "Use the Drop Wizard to configure and deploy an ERC-721 collection on Electroneum (ETN).",
    supply: [{ "@type": "HowToSupply", name: "ETN for deployment & fees" }],
    tool: [{ "@type": "HowToTool", name: "Web3 wallet (MetaMask / Rabby)" }],
    step: [
      {
        "@type": "HowToStep",
        name: "Connect wallet",
        text: "Connect your wallet from the page header.",
      },
      {
        "@type": "HowToStep",
        name: "Collection details",
        text: "Enter name, symbol, description, and upload logo/cover.",
      },
      {
        "@type": "HowToStep",
        name: "Mint configuration",
        text: "Choose total supply, mint price in ETN, and max per wallet.",
      },
      {
        "@type": "HowToStep",
        name: "Royalties & payout",
        text: "Set royalty percentage and payout address.",
      },
      {
        "@type": "HowToStep",
        name: "Deploy & verify",
        text: "Confirm the transaction, wait for confirmations, and verify on-chain.",
      },
    ],
  };

  return (
    <>
      {/* Structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdHowTo) }}
      />

      {/* UI */}
      <Header />
      <section className="flex w-full min-h-screen mt-10">
        <div className="w-full max-w-6xl mx-auto px-5 md:px-8 py-10">
          <DropWizard />
        </div>
      </section>
    </>
  );
}
