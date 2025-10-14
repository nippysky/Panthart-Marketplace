// app/erc1155/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { NftStatus, Prisma } from "@/lib/generated/prisma";
import prisma, { prismaReady } from "@/lib/db";
import Erc1155GridClient from "@/components/home/erc1155-grid-client";

/* ---------- SEO constants ---------- */
const SITE_NAME = "Panthart";
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://panth.art";

const TITLE = "All ERC-1155 NFTs";
const DESCRIPTION =
  "Uncover a dynamic archive of multi-edition artworks designed for collectors. Each ERC-1155 token represents a unique opportunity to own, trade, and track scalable digital editions";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: TITLE,
    template: "%s | Panthart",
  },
  description: DESCRIPTION,
  alternates: {
    canonical: "/erc1155",
    languages: {
      "en-US": "/erc1155",
    },
  },
  keywords: [
    "Panthart",
    "Electroneum",
    "ETN",
    "NFT",
    "ERC1155",
    "multi-edition",
    "digital collectibles",
    "crypto art",
    "marketplace",
    "web3",
  ],
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
    type: "website",
    url: `${BASE_URL}/erc1155`,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: `${BASE_URL}/opengraph-image.png`,
        width: 1200,
        height: 630,
        alt: "Panthart — ERC-1155 Gallery",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@decentroneum",
    creator: "@decentroneum",
    title: TITLE,
    description: DESCRIPTION,
    images: [`${BASE_URL}/opengraph-image.png`],
  },
  category: "technology",
};

/* ---------- Page ---------- */
export default async function Erc1155IndexPage() {
  await prismaReady;

  const where: Prisma.NFTWhereInput = {
    standard: "ERC1155",
    status: { equals: NftStatus.SUCCESS },
    imageUrl: { not: null },
  };

  const firstPageSize = 24;

  const items = await prisma.nFT.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: firstPageSize,
    select: {
      id: true,
      contract: true,
      tokenId: true,
      name: true,
      imageUrl: true,
      createdAt: true,
      single1155: { select: { name: true } },
      collection: { select: { name: true } },
    },
  });

  const nextCursor =
    items.length === firstPageSize
      ? `${items[items.length - 1].createdAt.toISOString()}|${items[items.length - 1].id}`
      : null;

  return (
    <section className="min-h-screen flex flex-col lg:px-20 md:px-10 px-5">
      <header className="w-full py-10 sm:py-12">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
          Discover All ERC-1155 Assets
        </h1>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground">
          Uncover a dynamic archive of multi-edition artworks designed for collectors. Each ERC-1155 token represents a unique opportunity to own, trade, and track scalable digital editions.
        </p>
      </header>

      {/* Client grid handles progressive loading; page stays server-rendered */}
      <Erc1155GridClient initialItems={items} initialCursor={nextCursor} />
    </section>
  );
}
