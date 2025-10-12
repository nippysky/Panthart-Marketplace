// app/api/profile/[address]/items/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma";
import {
  NftStatus,
  ListingStatus,
  AuctionStatus,
  CurrencyKind,
} from "@/lib/generated/prisma";

/* ----------------------------- helpers ----------------------------- */

/** Encode a numeric offset cursor for simple offset pagination */
function encodeOffsetCursor(n: number) {
  return Buffer.from(String(n), "utf8").toString("base64url");
}
/** Decode a numeric offset cursor (invalid -> 0) */
function decodeOffsetCursor(c: string | null) {
  if (!c) return 0;
  try {
    const s = Buffer.from(c, "base64url").toString("utf8");
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}
/** parseBool: "true" | "false" -> boolean | undefined */
function parseBool(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}
/** Base-units -> ETN (18dp) */
function weiToEtn(wei?: any): number | undefined {
  if (wei == null) return undefined;
  const s = typeof wei === "string" ? wei : wei.toString?.() ?? String(wei);
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return n / 1e18;
}

/* ------------------------------- GET ------------------------------- */
/**
 * Returns a unified list of the user's items:
 *  • ERC-721 they own
 *  • ERC-1155 holdings (generic holding table)
 *  • Single-1155 balances (platform table)
 *
 * Pricing:
 *  • Finds the cheapest active listing for each NFT, preferring native ETN
 *    (currencyId NULL or Currency.kind = 'NATIVE'); else cheapest ERC-20.
 *  • Time-gated: startTime <= now AND (endTime IS NULL OR endTime > now)
 *
 * Sorting:
 *  • sort=lowToHigh|highToLow => by resolved `listingPrice` number
 *    (ETN value for native; tokenAmount/10^decimals for ERC-20).
 *  • Default => most recently updated.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ address: string }> }
) {
  await prismaReady;
  const { address } = await ctx.params;

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 20, 50));
  const offset = decodeOffsetCursor(url.searchParams.get("cursor"));
  const search = (url.searchParams.get("search") || "").trim();
  const filterListed = parseBool(url.searchParams.get("listed")) ?? false;
  const filterAuctioned = parseBool(url.searchParams.get("auctioned")) ?? false;
  const sort = (url.searchParams.get("sort") || "") as
    | ""
    | "lowToHigh"
    | "highToLow";

  // Ensure user row exists (matches your current behavior)
  let user = await prisma.user.findFirst({
    where: { walletAddress: { equals: address, mode: "insensitive" } },
    select: { id: true, walletAddress: true },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        walletAddress: address,
        username: `${address.slice(0, 6)}...${address.slice(-4)}`,
        profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`,
        profileBanner:
          "https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png",
      },
      select: { id: true, walletAddress: true },
    });
  }

  // ERC-1155 holdings (generic)
  const holdings = await prisma.erc1155Holding.findMany({
    where: {
      ownerAddress: { equals: address, mode: "insensitive" },
      balance: { gt: 0 },
    },
    select: { contract: true, tokenId: true },
    orderBy: { updatedAt: "desc" },
    take: 2000,
  });
  const holdingPairs: Prisma.NFTWhereInput[] = holdings.map((h) => ({
    AND: [
      { contract: { equals: h.contract, mode: "insensitive" } },
      { tokenId: h.tokenId },
    ],
  }));

  // Single-1155 balances (platform)
  const s1155 = await prisma.erc1155Balance.findMany({
    where: {
      ownerAddress: { equals: address, mode: "insensitive" },
      balance: { gt: 0 },
    },
    select: { single1155Id: true },
    take: 2000,
  });
  const single1155Ids = s1155.map((b) => b.single1155Id);

  // Base filters
  const andFilters: Prisma.NFTWhereInput[] = [{ status: NftStatus.SUCCESS }];

  if (search) {
    andFilters.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { tokenId: { contains: search } },
      ],
    });
  }

  // Time gates (MUTABLE arrays: avoid readonly error in Prisma WhereInput)
  const now = new Date();
  const listingTimeGate: Prisma.MarketplaceListingWhereInput = {
    status: ListingStatus.ACTIVE,
    startTime: { lte: now },
    OR: [{ endTime: null }, { endTime: { gt: now } }],
  };
  const auctionTimeGate: Prisma.AuctionWhereInput = {
    status: AuctionStatus.ACTIVE,
    startTime: { lte: now },
    endTime: { gt: now },
  };

  if (filterListed) {
    andFilters.push({ listingEntries: { some: listingTimeGate } });
  }
  if (filterAuctioned) {
    andFilters.push({ auctionEntries: { some: auctionTimeGate } });
  }

  // Owner OR holdings OR single1155
  const orScope: Prisma.NFTWhereInput[] = [
    { owner: { is: { walletAddress: { equals: address, mode: "insensitive" } } } },
    ...holdingPairs,
  ];
  if (single1155Ids.length) {
    orScope.push({ single1155Id: { in: single1155Ids } });
  }

  // Pull bounded superset; compute cheapest listing (native vs token) in JS
  const rows = await prisma.nFT.findMany({
    where: { AND: andFilters, OR: orScope },
    select: {
      id: true,
      tokenId: true,
      name: true,
      imageUrl: true,
      description: true,
      traits: true,
      attributes: true,
      tokenUri: true,
      contract: true,
      standard: true,
      royaltyBps: true,
      royaltyRecipient: true,
      collectionId: true,
      createdAt: true,
      updatedAt: true,

      // Listings: enough data to compute cheapest active (native or ERC-20)
      listingEntries: {
        where: listingTimeGate,
        orderBy: [{ priceEtnWei: "asc" }, { priceTokenAmount: "asc" }],
        take: 50,
        select: {
          priceEtnWei: true,
          priceTokenAmount: true,
          currency: {
            select: { symbol: true, decimals: true, kind: true },
          },
        },
      },

      // Auctions: time-gated
      auctionEntries: {
        where: auctionTimeGate,
        take: 1,
        select: { id: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 1000,
  });

  // Final shape returned to client
  type MappedItem = {
    id: string;
    tokenId: string;
    name: string | null;
    imageUrl: string | null;
    contract: string;
    description?: string;
    traits?: any;
    attributes?: any;
    tokenUri?: string | null;
    standard?: string | null;
    royaltyBps?: number | null;
    royaltyRecipient?: string | null;
    collectionId?: string | null;

    isListed: boolean;
    listingPrice?: number;          // human display (ETN or token / 10^decimals)
    listingPriceWei?: string;       // base units (ETN wei or token base units)
    listingCurrencySymbol?: string; // "ETN" or token symbol

    isAuctioned: boolean;
    viewCount: number;      // keeping shape (0 default)
    favoriteCount: number;  // keeping shape (0 default)
    createdAt: string;
    updatedAt: string;
  };

  const mapped: MappedItem[] = rows.map((n) => {
    // Split listing candidates
    const natives = n.listingEntries.filter(
      (le) =>
        (!le.currency || le.currency.kind === CurrencyKind.NATIVE) &&
        le.priceEtnWei != null
    );
    const tokens = n.listingEntries.filter(
      (le) => le.currency && le.currency.kind === CurrencyKind.ERC20 && le.priceTokenAmount != null
    );

    let listingPrice: number | undefined;
    let listingCurrencySymbol: string | undefined;
    let listingPriceWei: string | undefined;

    if (natives.length > 0) {
      const cheapest = natives[0]!;
      listingPrice = weiToEtn(cheapest.priceEtnWei as any);
      listingCurrencySymbol = "ETN";
      listingPriceWei =
        (cheapest.priceEtnWei as any)?.toString?.() ??
        String(cheapest.priceEtnWei);
    } else if (tokens.length > 0) {
      const cheapest = tokens
        .slice()
        .sort(
          (a, b) =>
            Number(a.priceTokenAmount) - Number(b.priceTokenAmount)
        )[0]!;
      const dec = Number(cheapest.currency?.decimals ?? 18);
      listingPrice = Number(cheapest.priceTokenAmount) / 10 ** dec;
      listingCurrencySymbol = cheapest.currency?.symbol || "ERC20";
      listingPriceWei =
        (cheapest.priceTokenAmount as any)?.toString?.() ??
        String(cheapest.priceTokenAmount);
    }

    const isListed = listingPrice != null;
    const isAuctioned = (n.auctionEntries?.length ?? 0) > 0;

    return {
      id: n.id,
      tokenId: n.tokenId,
      name: n.name,
      imageUrl: n.imageUrl,
      contract: n.contract,
      description: n.description ?? undefined,
      traits: (n.traits as any) ?? undefined,
      attributes: (n.attributes as any) ?? undefined,
      tokenUri: n.tokenUri ?? undefined,
      standard: n.standard ?? undefined,
      royaltyBps: n.royaltyBps ?? undefined,
      royaltyRecipient: n.royaltyRecipient ?? undefined,
      collectionId: n.collectionId ?? undefined,

      isListed,
      listingPrice,
      listingPriceWei,
      listingCurrencySymbol,

      isAuctioned,
      viewCount: 0,
      favoriteCount: 0,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    };
  });

  // Sorting
  if (sort === "lowToHigh" || sort === "highToLow") {
    const inf = Number.POSITIVE_INFINITY;
    mapped.sort((a: MappedItem, b: MappedItem) => {
      const pa = a.listingPrice ?? inf;
      const pb = b.listingPrice ?? inf;
      return sort === "lowToHigh" ? pa - pb : pb - pa;
    });
  } else {
    mapped.sort(
      (a: MappedItem, b: MappedItem) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  // Offset pagination
  const slice = mapped.slice(offset, offset + limit);
  const nextCursor =
    offset + limit < mapped.length ? encodeOffsetCursor(offset + limit) : null;

  const resp = NextResponse.json({ items: slice, nextCursor }, { status: 200 });
  resp.headers.set("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
  return resp;
}
