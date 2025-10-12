export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { headers } from "next/headers";
import type { NFTItem, NFTActivity } from "@/lib/types/types";
import type { Profile, DisplayGroup } from "@/lib/types/nft-page";
import { asISO } from "@/lib/utils/time";
import { cacheKey, memoizeAsync } from "@/lib/server/chain-cache";
import NFTTokenPageComponent from "@/components/shared/nft-token-page";

/* ---------------- utils ---------------- */
async function absoluteUrl(path: string) {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (envBase) return `${envBase}${path}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (host && host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

/* ---------------- types ---------------- */
type PageContext = {
  params: Promise<{ contract: string; tokenId: string }>;
};

/* ---------------- SEO ---------------- */
export async function generateMetadata(ctx: PageContext): Promise<Metadata> {
  const { contract, tokenId } = await ctx.params;
  const canonicalPath = `/collections/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`;
  const ogUrl = await absoluteUrl(`/og/nft/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`);

  try {
    const apiUrl = await absoluteUrl(
      `/api/nft/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`
    );

    const nftRes = await fetch(apiUrl, { cache: "no-store" });

    if (!nftRes?.ok) {
      return {
        title: "NFT Not Found",
        alternates: { canonical: canonicalPath },
        robots: { index: true, follow: true },
      };
    }

    const payload = await nftRes.json();
    const title =
      payload?.nft?.name ??
      `${payload?.displayGroup?.title ?? "NFT"} #${tokenId}`;
    const desc =
      payload?.nft?.description ??
      `View item ${tokenId} from ${payload?.displayGroup?.title ?? "collection"} on Panthart.`;
    const nftImg: string | undefined = payload?.nft?.image || undefined;

    return {
      title,
      description: desc,
      alternates: { canonical: canonicalPath },
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
        "NFT",
        "ETN",
        "Electroneum",
        "ERC721",
        "ERC1155",
        payload?.displayGroup?.title ?? "Collection",
        contract,
        tokenId,
      ],
      openGraph: {
        type: "website",
        url: canonicalPath,
        title,
        description: desc,
        siteName: "Panthart",
        images: [
          { url: ogUrl, width: 1200, height: 630, alt: `${title} — Panthart` },
          ...(nftImg ? [{ url: nftImg }] : []),
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: desc,
        images: [ogUrl],
        site: "@decentroneum",
        creator: "@decentroneum",
      },
    };
  } catch {
    return {
      title: "NFT",
      alternates: { canonical: canonicalPath },
      robots: { index: true, follow: true },
    };
  }
}

/* -------------- tiny cache for activity -------------- */
const ACT_TTL = 30_000;
async function getActivities(contract: string, tokenId: string) {
  const key = cacheKey(["acts", contract, tokenId]);
  return memoizeAsync<NFTActivity[]>(key, ACT_TTL, async () => {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/nft/${contract}/${tokenId}/activities?limit=100`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    return (await res.json()) as NFTActivity[];
  });
}

/* ---------------- Page ---------------- */
export default async function Page(ctx: PageContext) {
  const { contract, tokenId } = await ctx.params;

  const [nftRes, activeAuctionsRes] = await Promise.all([
    fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/nft/${encodeURIComponent(
        contract
      )}/${encodeURIComponent(tokenId)}`,
      { cache: "no-store" }
    ),
    fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/auction/active?contract=${encodeURIComponent(
        contract
      )}&tokenId=${encodeURIComponent(tokenId)}`,
      { cache: "no-store" }
    ).catch(() => null),
  ]);
  if (!nftRes.ok) return null;

  const data = await nftRes.json();
  const activeJson = activeAuctionsRes && activeAuctionsRes.ok ? await activeAuctionsRes.json() : null;

  const aucItem =
    activeJson?.items?.find?.(
      (it: any) =>
        it?.nft?.contract === contract && String(it?.nft?.tokenId) === String(tokenId)
    ) ?? null;

  const currentNFT: NFTItem = data.nft;
  const activities = await getActivities(currentNFT.nftAddress, currentNFT.tokenId);

  const canonical = `https://panth.art/collections/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`;
  const collectionTitle: string | undefined = data.displayGroup?.title || undefined;
  const collectionUrl = `https://panth.art/collections/${encodeURIComponent(contract)}`;
  const productName =
    currentNFT.name || `${collectionTitle || "NFT"} #${currentNFT.tokenId}`;
  const productDesc =
    (currentNFT.description as string) ||
    `View item ${currentNFT.tokenId} from ${collectionTitle || "collection"} on Panthart.`;
  const image = typeof currentNFT.image === "string" ? currentNFT.image : undefined;

  const isListed = Boolean(currentNFT.isListed);
  const price = isListed ? currentNFT.listingPrice : undefined;
  const quantity = isListed ? data.listQuantity : undefined;

  const listings: Array<{ price: number }> | undefined = data.listings;
  const offerCount = listings?.length ?? (isListed ? 1 : 0);
  const lowPrice =
    listings && listings.length
      ? Math.min(...listings.map((l) => l.price))
      : price;
  const highPrice =
    listings && listings.length
      ? Math.max(...listings.map((l) => l.price))
      : price;

  const aucStartISO = asISO(aucItem?.startTime);
  const aucEndISO = asISO(aucItem?.endTime);
  const aucPriceHuman = typeof aucItem?.price?.current === "string" ? aucItem?.price?.current : null;

  const baseProductLd: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName,
    description: productDesc,
    image,
    url: canonical,
    sku: currentNFT.tokenId,
    brand: collectionTitle ? { "@type": "Brand", name: collectionTitle } : undefined,
    category: "DigitalCollectible",
    identifier: [
      { "@type": "PropertyValue", name: "contract", value: currentNFT.nftAddress },
      { "@type": "PropertyValue", name: "tokenId", value: currentNFT.tokenId },
      currentNFT.standard && {
        "@type": "PropertyValue",
        name: "standard",
        value: currentNFT.standard,
      },
      typeof currentNFT.royaltyBps === "number" && {
        "@type": "PropertyValue",
        name: "royaltyBps",
        value: currentNFT.royaltyBps,
      },
    ].filter(Boolean),
  };

  if (offerCount > 1 && typeof lowPrice === "number" && typeof highPrice === "number") {
    baseProductLd.offers = {
      "@type": "AggregateOffer",
      priceCurrency: "ETN",
      lowPrice,
      highPrice,
      offerCount,
      url: canonical,
    };
  } else if (isListed && typeof price === "number") {
    baseProductLd.offers = {
      "@type": "Offer",
      priceCurrency: "ETN",
      price,
      availability: "https://schema.org/InStock",
      url: canonical,
      ...(typeof quantity === "number" && quantity > 0
        ? { inventoryLevel: { "@type": "QuantitativeValue", value: quantity } }
        : {}),
    };
  }

  const saleEventLd =
    aucEndISO
      ? {
          "@context": "https://schema.org",
          "@type": "SaleEvent",
          name: `${productName} — Auction`,
          eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
          eventStatus: "https://schema.org/EventScheduled",
          startDate: aucStartISO,
          endDate: aucEndISO,
          url: canonical,
          location: { "@type": "VirtualLocation", url: canonical },
          offers: {
            "@type": "Offer",
            url: canonical,
            priceCurrency: aucItem?.currency?.symbol || "ETN",
            price: typeof aucPriceHuman === "string" ? Number(aucPriceHuman) : undefined,
            availabilityStarts: aucStartISO,
            availabilityEnds: aucEndISO,
          },
        }
      : null;

  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://panth.art/" },
      { "@type": "ListItem", position: 2, name: "Collections", item: "https://panth.art/collections" },
      { "@type": "ListItem", position: 3, name: collectionTitle || currentNFT.nftAddress, item: collectionUrl },
      { "@type": "ListItem", position: 4, name: productName, item: canonical },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(baseProductLd) }} />
      {saleEventLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(saleEventLd) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsLd) }} />

      <NFTTokenPageComponent
        nft={currentNFT}
        activities={activities}
        creator={data.creator as Profile}
        owner={data.owner as Profile}
        isOrphan={Boolean(data.isOrphan)}
        displayGroup={data.displayGroup as DisplayGroup}
        traitsWithRarity={data.traitsWithRarity}
        rarityScore={data.rarityScore}
        rarityRank={data.rarityRank}
        population={data.population}
        listQuantity={data.listQuantity}
        rawMetadata={data.rawMetadata ?? null}
        erc1155OwnerCount={data.erc1155OwnerCount ?? null}
      />
    </>
  );
}
