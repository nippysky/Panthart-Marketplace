// app/create/single-erc721/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import React from "react";
import Header from "@/components/shared/header";
import BackButton from "@/components/shared/back-button";
import CreateSingleERC721Form from "@/components/create/single-erc721-form";

/* ───────────── SEO ───────────── */
const TITLE = "Create Single NFT (ERC-721) — Mint a 1/1 | Panthart";
const DESCRIPTION =
  "Mint a one-of-one ERC-721 NFT on Electroneum (ETN). Upload media, set metadata and royalties, then mint or list directly—all in a guided flow.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/create/single-erc721" },
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
    "Create Single NFT",
    "ERC-721",
    "One of One",
    "1/1 NFT",
    "Electroneum",
    "ETN",
    "Mint NFT",
    "Royalties",
    "Web3",
  ],
  openGraph: {
    type: "website",
    url: "/create/single-erc721",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Panthart — Create Single ERC-721 NFT",
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

export default function CreateSingleERC721() {
  // JSON-LD (Breadcrumbs + HowTo)
  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Create", item: "/create" },
      {
        "@type": "ListItem",
        position: 3,
        name: "Single (ERC-721)",
        item: "/create/single-erc721",
      },
    ],
  };

  const jsonLdHowTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to mint a single ERC-721 NFT on Panthart",
    description:
      "Use the Single ERC-721 flow to upload media, set metadata and royalties, then mint on Electroneum (ETN).",
    supply: [{ "@type": "HowToSupply", name: "ETN for gas & fees" }],
    tool: [{ "@type": "HowToTool", name: "Web3 wallet (MetaMask / Rabby)" }],
    step: [
      {
        "@type": "HowToStep",
        name: "Connect wallet",
        text: "Connect your wallet from the page header.",
      },
      {
        "@type": "HowToStep",
        name: "Upload media",
        text: "Upload your artwork (image, video, or animation).",
      },
      {
        "@type": "HowToStep",
        name: "Add metadata",
        text: "Enter name, description, and attributes.",
      },
      {
        "@type": "HowToStep",
        name: "Set royalties",
        text: "Choose a royalty percentage and payout address.",
      },
      {
        "@type": "HowToStep",
        name: "Mint & (optionally) list",
        text: "Confirm the transaction, wait for confirmations, and optionally list on the marketplace.",
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

      {/* Always-on-top site header */}
      <Header />

      {/* Page body */}
      <main className="min-h-[100svh] bg-background">
        <section className="mx-auto w-full max-w-5xl px-4 md:px-6 lg:px-8 py-6 md:py-10">
          {/* Back button */}
          <div className="mb-4 md:mb-6">
            <BackButton className="inline-flex items-center rounded-md border border-white/10 bg-background/60 px-3 py-2 text-sm shadow-sm backdrop-blur-md hover:bg-background/70" />
          </div>

          {/* Page intro */}
          <header className="mb-6 md:mb-8">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Create Single (ERC-721)
            </h1>
            <p className="mt-2 text-sm md:text-base text-muted-foreground">
              Mint a one-of-one NFT. First upload your media, then add or upload
              metadata, and finally deploy.
            </p>
          </header>

          {/* Wizard/Form */}
          <CreateSingleERC721Form />
        </section>
      </main>
    </>
  );
}
