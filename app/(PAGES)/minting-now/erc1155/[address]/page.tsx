export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ERC1155MintClient from "@/components/shared/erc1155-mint-page";
import { fetchERC1155MintDetails } from "@/lib/server/erc1155-details";

// Keep your Promise<params> shape
type PageContext = { params: Promise<{ address: string }> };

/* ----------------------------------------
 * Helpers
 * -------------------------------------- */
function toETN(wei?: string | number | bigint): number | undefined {
  if (wei == null) return undefined;
  const n = Number(wei);
  return Number.isFinite(n) ? n / 1e18 : undefined;
}

// Remove undefined/null (shallow) so JSON-LD is clean
function clean<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out as T;
}

/* ----------------------------------------
 * SEO
 * -------------------------------------- */
export async function generateMetadata(ctx: PageContext): Promise<Metadata> {
  const { address } = await ctx.params;

  try {
    const d = await fetchERC1155MintDetails(address);
    if (!d) {
      return {
        title: "Mint ERC-1155 | Panthart",
        description:
          "Mint ERC-1155 NFTs on Panthart. View live mint details, price, and supply on Electroneum (ETN).",
        alternates: { canonical: `/minting-now/erc1155/${address}` },
        robots: { index: true, follow: true },
      };
    }

    const name = d.name || "Mint ERC-1155";
    const title = `Mint ${name} (ERC-1155) | Panthart`;
    const desc =
      d.description?.slice?.(0, 220) ||
      `Mint ${name} on Panthart. View price, supply and schedule on Electroneum (ETN).`;

    const ogImage = d.imageUrl || undefined;

    return {
      title,
      description: desc,
      alternates: { canonical: `/minting-now/erc1155/${address}` },
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
        url: `/minting-now/erc1155/${address}`,
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
        "ERC1155",
        "Single drop",
        "NFT mint",
        "Electroneum",
        "ETN",
        "Web3",
        name,
      ],
    };
  } catch {
    return {
      title: "Mint ERC-1155 | Panthart",
      description:
        "Mint ERC-1155 NFTs on Panthart. View live mint details, price, and supply on Electroneum (ETN).",
      alternates: { canonical: `/minting-now/erc1155/${address}` },
      robots: { index: true, follow: true },
    };
  }
}

/* ----------------------------------------
 * Page (server component)
 * -------------------------------------- */
export default async function ERC1155MintPage(ctx: PageContext) {
  const { address } = await ctx.params;

  const details = await fetchERC1155MintDetails(address);
  if (!details) notFound();

  const name = details.name || "ERC-1155 Drop";
  const image = details.imageUrl;
  const priceETN =
    details.priceEtnWei ??
    toETN((details as any).mintPriceEtnWei) ??
    undefined;

  const startsAt = (details as any).startTime as string | undefined;
  const endsAt = (details as any).endTime as string | undefined;

  const productJsonLd = clean({
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description:
      details.description ||
      `Mint ${name} on Panthart (ERC-1155 on Electroneum).`,
    image,
    brand: { "@type": "Brand", name: "Panthart" },
    sku: address.toLowerCase(),
    additionalProperty: clean({
      "@type": "PropertyValue",
      name: "Contract",
      value: address,
    }),
    offers:
      priceETN !== undefined
        ? clean({
            "@type": "Offer",
            url: `/minting-now/erc1155/${address}`,
            price: Number(priceETN).toFixed(4),
            priceCurrency: "ETN",
            availability: "https://schema.org/InStock",
            validFrom: startsAt,
            priceValidUntil: endsAt,
          })
        : undefined,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <ERC1155MintClient details={details} />
    </>
  );
}
