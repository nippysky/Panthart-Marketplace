// app/create/single-erc1155/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import React from "react";
import Header from "@/components/shared/header";
import BackButton from "@/components/shared/back-button";
import CreateSingleERC1155Form from "@/components/create/CreateSingleERC1155Form";

/* ───────────── SEO ───────────── */
const TITLE = "Create Single NFT (ERC-1155) — Fixed Supply Editions | Panthart";
const DESCRIPTION =
  "Mint a single-token ERC-1155 with a fixed max supply on Electroneum (ETN). Upload media, define metadata, set supply & royalties, then deploy and (optionally) list.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/create/single-erc1155" },
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
    "Create Single ERC1155",
    "ERC-1155",
    "Editions",
    "Fixed Supply",
    "Electroneum",
    "ETN",
    "Mint NFT",
    "Royalties",
    "Web3",
  ],
  openGraph: {
    type: "website",
    url: "/create/single-erc1155",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Panthart — Create Single ERC-1155",
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

export default function CreateSingleERC1155() {
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
        name: "Single (ERC-1155)",
        item: "/create/single-erc1155",
      },
    ],
  };

  const jsonLdHowTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to mint a single ERC-1155 on Panthart",
    description:
      "Use the Single ERC-1155 flow to upload media, define metadata, choose a fixed max supply and royalties, then deploy on Electroneum (ETN).",
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
        text: "Upload your artwork (image/video/animation).",
      },
      {
        "@type": "HowToStep",
        name: "Add metadata",
        text: "Enter name, description, and attributes (1.json).",
      },
      {
        "@type": "HowToStep",
        name: "Set max supply & royalties",
        text: "Choose a fixed max supply and royalty percentage.",
      },
      {
        "@type": "HowToStep",
        name: "Deploy & (optionally) list",
        text: "Confirm the transaction and, once minted, optionally list on the marketplace.",
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

      {/* Global header */}
      <Header />

      {/* Page body */}
      <main className="min-h-[100svh] bg-background">
        <section className="mx-auto w-full max-w-5xl px-4 md:px-6 lg:px-8 py-6 md:py-10">
          {/* Back button */}
          <div className="mb-4 md:mb-6">
            <BackButton className="inline-flex items-center rounded-md border border-white/10 bg-background/60 px-3 py-2 text-sm shadow-sm backdrop-blur-md hover:bg-background/70" />
          </div>

          {/* Title & intro */}
          <header className="mb-6 md:mb-8">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Create Single (ERC-1155)
            </h1>
            <p className="mt-2 text-sm md:text-base text-muted-foreground">
              Panthart Single Editions — upload your media, we’ll build metadata
              (1.json), choose a fixed max supply & royalties, then deploy your
              single-token ERC-1155 on ETN.
            </p>
          </header>

          {/* Form/Wizard */}
          <CreateSingleERC1155Form />
        </section>
      </main>
    </>
  );
}
