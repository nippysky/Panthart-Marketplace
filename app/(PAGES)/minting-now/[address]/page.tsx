// app/(PAGES)/minting-now/[address]/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import NFTMintPageComponent from "@/components/shared/nft-mint-page-component";
import { fetchMintDetails } from "@/lib/server/mint-details";
import { notFound } from "next/navigation";

// Keep your Promise<params> shape
type PageContext = {
  params: Promise<{ address: string }>;
};

/**
 * SEO — builds from the same server source of truth as the page.
 * Falls back gracefully if any field is missing.
 */
export async function generateMetadata(ctx: PageContext): Promise<Metadata> {
  const { address } = await ctx.params;
  
  try {
    const details = await fetchMintDetails(address);
    if (!details) return { title: "Mint NFT" };

    const name = details?.name || "Mint NFT";
    const title = `Mint ${name}| Panthart`;
    const desc =
      details?.description?.slice?.(0, 220) ??
      `Mint ${name} on Panthart. View price, supply, schedule, and start minting on Electroneum (ETN).`;

    // Prefer a large, social-friendly image (cover > logo > nothing)
    const ogImage =
      details?.coverUrl || details?.logoUrl || details?.logoUrl || undefined;

    return {
      title,
      description: desc,
      alternates: {
        canonical: `/minting-now/${address}`,
      },
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
        title,
        description: desc,
        url: `/minting-now/${address}`,
        siteName: "Panthart",
        images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: name }] : undefined,
        locale: "en_US",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: desc,
        creator: "@decentroneum",
        images: ogImage ? [ogImage] : undefined,
      },
      category: "marketplace",
      keywords: [
        "Panthart",
        "Mint",
        "NFT mint",
        "ERC721",
        "Electroneum",
        "ETN",
        "Web3",
        name,
      ],
    };
  } catch {
    return {
      title: "Mint NFT | Panthart",
      description:
        "Mint NFTs on Panthart. View live mint details, price, and supply on Electroneum (ETN).",
      alternates: { canonical: `/minting-now/${address}` },
      robots: { index: true, follow: true },
    };
  }
}

export default async function MintNFTDetails(context: PageContext) {
  const { address } = await context.params;

  const details = await fetchMintDetails(address);
  if (!details) {
    notFound();
  }

  return <NFTMintPageComponent address={details.contract} details={details} />;
}
