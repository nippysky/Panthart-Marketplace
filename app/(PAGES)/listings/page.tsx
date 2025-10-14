export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import prisma, { prismaReady } from "@/lib/db";
import { ListingStatus, NftStatus } from "@/lib/generated/prisma";
import ListingsGridClient from "@/components/home/listings-grid-client";

const TITLE = "Fixed-Price Listings | Panthart";
const DESCRIPTION =
  "Live fixed-price listings across ERC-721 and ERC-1155. Server-rendered for speed, progressively loaded for scale.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/listings" },
  openGraph: {
    type: "website",
    url: "/listings",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/opengraph-image.png"],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

export default async function ListingsPage() {
  await prismaReady;
  const now = new Date();
  const take = 24;

  const items = await prisma.marketplaceListing.findMany({
    where: {
      status: ListingStatus.ACTIVE,
      startTime: { lte: now },
      OR: [{ endTime: null }, { endTime: { gt: now } }],
      nft: { status: NftStatus.SUCCESS, imageUrl: { not: null as any } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      sellerAddress: true,
      quantity: true, // 👈 for ERC1155 qty badge
      createdAt: true,
      priceEtnWei: true,
      priceTokenAmount: true,
      nft: {
        select: {
          contract: true,
          tokenId: true,
          name: true,
          imageUrl: true,
          standard: true, // 👈 badge
        },
      },
      currency: { select: { symbol: true, decimals: true, tokenAddress: true } },
    },
  });

  const first = items.map((it) => {
    const isNative = !it.currency || !it.currency.tokenAddress || it.currency.symbol === "ETN";
    const decimals = it.currency?.decimals ?? 18;
    const raw = isNative ? String(it.priceEtnWei) : String(it.priceTokenAmount ?? "0");
    const pad = raw.padStart(decimals + 1, "0");
    const int = pad.slice(0, pad.length - decimals);
    const frac = pad.slice(pad.length - decimals).replace(/0+$/, "");
    return {
      id: it.id,
      createdAt: it.createdAt.toISOString(),
      href: `/collections/${it.nft.contract}/${it.nft.tokenId}`,
      title: it.nft.name || `#${it.nft.tokenId}`,
      media: it.nft.imageUrl,
      standard: it.nft.standard || "ERC721",
      quantity: it.quantity ?? 1,
      seller: it.sellerAddress,
      priceLabel: `${frac ? `${int}.${frac}` : int} ${
        isNative ? "ETN" : it.currency?.symbol ?? "TOKEN"
      }`,
    };
  });

  const nextCursor =
    items.length === take
      ? `${items[items.length - 1].createdAt.toISOString()}|${items[items.length - 1].id}`
      : null;

  return (
    <section className="min-h-screen flex flex-col lg:px-20 md:px-10 px-5">
      <header className="w-full py-10 sm:py-12">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
          Fixed-Price Listings
        </h1>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-2xl">
          Browse live listings across ERC-721 and ERC-1155.
        </p>
      </header>

      <ListingsGridClient initialItems={first} initialCursor={nextCursor} />
    </section>
  );
}
