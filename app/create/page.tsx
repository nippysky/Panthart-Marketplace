// app/create/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import React from "react";

// Client components
import CreateFeaturedImage from "@/components/create/create-featured-image";
import CreateNFTOptions from "@/components/create/create-nft-option";
import BackButton from "@/components/shared/back-button";

export const metadata: Metadata = {
  title: "Create NFTs",
  description:
    "Mint your NFT or launch a collection on Panthart. Choose ERC-721 drops or ERC-721/1155 singles. Built for the Electroneum (ETN) ecosystem.",
  alternates: { canonical: "/create" },
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
    title: "Create on Panthart",
    description:
      "Mint NFTs or launch an ERC-721/1155 collection on the ETN-powered marketplace.",
    url: "/create",
    siteName: "Panthart",
    type: "website",
    images: ["/opengraph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Create on Panthart",
    description:
      "Mint NFTs or launch a collection (ERC-721/1155) with ETN.",
    images: ["/opengraph-image.png"],
    creator: "@decentroneum",
  },
  keywords: [
    "Panthart",
    "Create NFT",
    "Mint NFT",
    "Electroneum",
    "ETN",
    "ERC721",
    "ERC1155",
    "NFT Marketplace",
  ],
  category: "marketplace",
  referrer: "origin-when-cross-origin",
  formatDetection: { email: false, address: false, telephone: false },
};

function CreateContent() {
  return (
    <div className="w-full">
      <div className="mb-3 lg:hidden">
        <BackButton />
      </div>

      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Create</h1>
        <p className="mt-2 text-sm md:text-base text-muted-foreground">
          Pick how you want to mint. Collections are ERC-721 drops, while
          Singles can be ERC-721 or ERC-1155.
        </p>
      </header>

      <CreateNFTOptions />
    </div>
  );
}

export default async function CreateNFT() {
  return (
    <section
      className="
        relative w-full
        min-h-[100svh]
        px-4 py-6 md:px-8 lg:py-10
        flex justify-center
        items-start lg:items-center
        overflow-x-hidden overflow-y-visible
      "
    >
      {/* Desktop back button */}
      <div
        className="hidden lg:block fixed z-50"
        style={{
          top: "max(1rem, env(safe-area-inset-top))",
          left: "max(1rem, env(safe-area-inset-left))",
        }}
      >
        <BackButton className="backdrop-blur-md bg-background/60 border border-white/10 shadow-sm" />
      </div>

      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-24 h-72 w-72 rounded-full blur-3xl opacity-30 bg-gradient-to-br from-brand/30 to-brandsec/30" />
        <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full blur-3xl opacity-25 bg-gradient-to-tr from-brandsec/30 to-brand/30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/5" />
      </div>

      {/* Glass card */}
      <div
        className="
          relative w-full max-w-6xl
          h-auto lg:h-[88svh]
          rounded-3xl border border-white/10
          bg-white/5 dark:bg-white/5
          backdrop-blur-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.35)]
          ring-1 ring-black/5
          overflow-hidden
        "
      >
        <div className="pointer-events-none absolute inset-0 rounded-3xl [mask-image:radial-gradient(80%_80%_at_50%_50%,black,transparent)] ring-1 ring-white/10" />

        <div className="grid h-full grid-cols-1 lg:grid-cols-2 gap-0 items-start">
          {/* LEFT */}
          <div className="min-h-0">
            <div className="p-5 md:p-8 mx-auto w-full max-w-2xl">
              <CreateContent />
            </div>
          </div>

          {/* RIGHT preview */}
          <div className="relative hidden lg:flex flex-col items-start justify-start p-8 min-h-0 bg-gradient-to-br from-white/5 to-transparent border-t lg:border-l border-white/10">
            <div className="sticky top-8 w-full max-w-[680px]">
              <div className="aspect-square rounded-2xl overflow-hidden bg-muted/20 backdrop-blur-md border border-white/10 shadow-inner">
                <CreateFeaturedImage />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
