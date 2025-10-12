// app/(PAGES)/bid-featured-collection/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import prisma, { prismaReady } from "@/lib/db";
import FeaturedAuctionAbi from "@/lib/abis/FeaturedAuction.json";
import FeaturedClient from "@/components/featured/FeaturedClient";
import { FeaturedInitial } from "@/lib/types/featured-collections";

const RPC_HTTP = process.env.RPC_URL!;
const FEATURED_ADDR = process.env.NEXT_PUBLIC_FEATURED_AUCTION_ADDRESS!;

/* ───────────── SEO ───────────── */
const TITLE = "Bid to Feature Your NFT Collection | Panthart";
const DESCRIPTION =
  "Enter the Featured Auction to get your collection spotlighted across Panthart: the landing page, create flow, and more. Place or increase a bid in ETN. Winners are promoted site-wide.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/bid-featured-collection" },
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
    "Featured Auction",
    "Bid to be featured",
    "NFT Marketplace",
    "Electroneum",
    "ETN",
    "ERC721",
    "Crypto Art",
    "Digital Collectibles",
    "On-chain",
  ],
  openGraph: {
    type: "website",
    url: "/bid-featured-collection",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Panthart — Bid to Feature Your Collection",
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

/* ───────────── Data bootstrap ───────────── */
async function getInitial(): Promise<FeaturedInitial> {
  await prismaReady;

  const active = await prisma.featuredCycle.findFirst({
    where: { status: "ACTIVE" },
    orderBy: [{ startAt: "desc" }],
    select: {
      id: true,
      cycleId: true,
      startAt: true,
      endAt: true,
      minBidWei: true,
      status: true,
    },
  });

  if (!active) {
    return { active: null, fx: null, now: Date.now(), contract: FEATURED_ADDR };
  }

  const provider = new JsonRpcProvider(RPC_HTTP);
  const auction = new Contract(FEATURED_ADDR, FeaturedAuctionAbi as any, provider);

  const oc = await auction.getCycle(active.cycleId);
  const leader = String(oc[3] ?? "0x0000000000000000000000000000000000000000");
  const leaderAmountWei = oc[4] ? oc[4].toString() : "0";

  const fxRow = await prisma.feeConfig.findFirst({
    where: { active: true, pricingPair: "ETNUSD", lastPriceUsd: { not: null } },
    orderBy: [{ lastPriceAt: "desc" }, { updatedAt: "desc" }],
    select: { lastPriceUsd: true, lastPriceAt: true },
  });

  const leaderUser = leader
    ? await prisma.user.findUnique({
        where: { walletAddress: leader },
        select: { id: true, username: true, profileAvatar: true, walletAddress: true },
      })
    : null;

  return {
    active: {
      id: active.id,
      cycleId: active.cycleId,
      startAt: active.startAt.toISOString(),
      endAt: active.endAt.toISOString(),
      minBidWei: active.minBidWei.toString(),
      minBidETN: formatUnits(active.minBidWei.toString(), 18),
      status: active.status as "UPCOMING" | "ACTIVE" | "FINALIZED",
      leader,
      leaderAmountWei,
      leaderAmountETN: formatUnits(leaderAmountWei, 18),
      leaderUser,
    },
    fx:
      fxRow && fxRow.lastPriceUsd
        ? {
            lastPriceUsd: fxRow.lastPriceUsd.toString(),
            lastPriceAt: fxRow.lastPriceAt
              ? (fxRow.lastPriceAt as unknown as Date).toISOString?.() ??
                String(fxRow.lastPriceAt)
              : null,
          }
        : null,
    now: Date.now(),
    contract: FEATURED_ADDR,
  };
}

/* ───────────── Page ───────────── */
export default async function Page() {
  const initial = await getInitial();

  // JSON-LD: Breadcrumbs + (if active) Auction event details
  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Bid to Feature Your Collection",
        item: "/bid-featured-collection",
      },
    ],
  };

  const jsonLdAuction =
    initial.active
      ? {
          "@context": "https://schema.org",
          "@type": "Event",
          name: "Panthart Featured Auction",
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
          startDate: initial.active.startAt,
          endDate: initial.active.endAt,
          location: {
            "@type": "VirtualLocation",
            url: "/bid-featured-collection",
          },
          offers: {
            "@type": "Offer",
            priceCurrency: "ETN",
            price: initial.active.minBidETN,
            availability: "https://schema.org/InStock",
          },
          organizer: {
            "@type": "Organization",
            name: "Panthart",
            url: "/",
          },
        }
      : null;

  return (
    <>
      {/* SEO: JSON-LD */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }}
      />
      {jsonLdAuction ? (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdAuction) }}
        />
      ) : null}

      <FeaturedClient initial={initial} />
    </>
  );
}
