// app/(PAGES)/collections/[contract]/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import CollectionPageComponent from "@/components/collection/collection-page-component";

/* ----------------------------------------------------------------------------
 * Build absolute URL for server-side fetches.
 * - Prefers NEXT_PUBLIC_BASE_URL if set (must include protocol).
 * - Otherwise derives origin from incoming request headers.
 * --------------------------------------------------------------------------*/
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

// Keep your Promise<params> shape
type PageContext = { params: Promise<{ contract: string }> };

/* ----------------------------------------------------------------------------
 * SEO
 * We fetch the lightweight header-only payload to build rich metadata.
 * --------------------------------------------------------------------------*/
export async function generateMetadata(ctx: PageContext): Promise<Metadata> {
  const { contract } = await ctx.params;
  const canonicalPath = `/collections/${encodeURIComponent(contract)}`;

  try {
    const url = await absoluteUrl(
      `/api/collections/${encodeURIComponent(contract)}?header=1`
    );
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return {
        title: "Collection",
        alternates: { canonical: canonicalPath },
        robots: { index: true, follow: true },
      };
    }

    const data = await res.json();

    const name = (data?.name as string) || "Collection";
    const shortDesc =
      (data?.description as string)?.slice?.(0, 220) ||
      `Explore NFTs from ${name}. View items, activity, owners and more on Panthart.`;

    // Prefer cover image for social, then logo
    const ogImage = (data?.coverUrl as string) || (data?.logoUrl as string) || undefined;

    return {
      title: name,
      description: shortDesc,
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
        "Electroneum",
        "ETN",
        "NFT Collection",
        "ERC721",
        "ERC1155",
        "Floor Price",
        "Volume",
        "Web3 Marketplace",
        name,
        contract,
      ],
      openGraph: {
        type: "website",
        url: canonicalPath,
        title: name,
        description: shortDesc,
        siteName: "Panthart",
        images: ogImage
          ? [
              {
                url: ogImage,
                width: 1200,
                height: 630,
                alt: `${name} — Panthart`,
              },
            ]
          : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: name,
        description: shortDesc,
        images: ogImage ? [ogImage] : undefined,
        site: "@decentroneum",
        creator: "@decentroneum",
      },
    };
  } catch {
    return {
      title: "Collection",
      alternates: { canonical: canonicalPath },
      robots: { index: true, follow: true },
    };
  }
}

/* ----------------------------------------------------------------------------
 * Page
 * We SSR the header-only payload (fast), and the client hydrates from it while
 * background-refreshing (also header-only to keep payload tiny).
 * Items are still streamed by the Items tab independently.
 * --------------------------------------------------------------------------*/
export default async function CollectionPage(ctx: PageContext) {
  const { contract } = await ctx.params;

  try {
    const url = await absoluteUrl(
      `/api/collections/${encodeURIComponent(contract)}?header=1`
    );
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return notFound();

    const headerOnly = await res.json();

    // Build JSON-LD safely from headerOnly fields
    const name = (headerOnly?.name as string) || "Collection";
    const desc =
      (headerOnly?.description as string)?.slice?.(0, 280) ||
      `Explore NFTs from ${name} on Panthart.`;
    const logo = (headerOnly?.logoUrl as string) || undefined;
    const cover = (headerOnly?.coverUrl as string) || undefined;
    const standard = (headerOnly?.standard as string) || undefined;
    const floor = typeof headerOnly?.floorPrice === "number" ? headerOnly.floorPrice : undefined;
    const volume = typeof headerOnly?.volume === "number" ? headerOnly.volume : undefined;
    const ownersCount =
      typeof headerOnly?.ownersCount === "number" ? headerOnly.ownersCount : undefined;
    const itemsCount =
      typeof headerOnly?.itemsCount === "number" ? headerOnly.itemsCount : undefined;

    const canonical = `https://panth.art/collections/${encodeURIComponent(contract)}`;

    const collectionEntityLd = {
      "@context": "https://schema.org",
      "@type": "Collection",
      name,
      description: desc,
      url: canonical,
      identifier: contract,
      additionalType: standard, // e.g., "ERC721" / "ERC1155"
      image: cover || logo || undefined,
      // Extra stats as "additionalProperty" (recommended for custom metrics)
      additionalProperty: [
        floor != null && {
          "@type": "PropertyValue",
          name: "floorPriceETN",
          value: floor,
        },
        volume != null && {
          "@type": "PropertyValue",
          name: "volumeETN",
          value: volume,
        },
        ownersCount != null && {
          "@type": "PropertyValue",
          name: "ownersCount",
          value: ownersCount,
        },
        itemsCount != null && {
          "@type": "PropertyValue",
          name: "itemsCount",
          value: itemsCount,
        },
      ].filter(Boolean),
      isPartOf: {
        "@type": "WebSite",
        name: "Panthart",
        url: "https://panth.art",
      },
    };

    const collectionPageLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name,
      description: desc,
      url: canonical,
      isPartOf: {
        "@type": "WebSite",
        name: "Panthart",
        url: "https://panth.art",
      },
      mainEntity: collectionEntityLd,
    };

    const breadcrumbsLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://panth.art/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Collections",
          item: "https://panth.art/collections",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: name,
          item: canonical,
        },
      ],
    };

    return (
      <>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionPageLd) }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsLd) }}
        />
        <CollectionPageComponent collection={headerOnly} />
      </>
    );
  } catch (err) {
    console.error("Error fetching collection header:", err);
    return notFound();
  }
}
