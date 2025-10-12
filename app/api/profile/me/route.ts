// app/api/profile/me/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import {
  Prisma,
  NftStatus,
  ListingStatus,
  AuctionStatus,
} from "@/lib/generated/prisma";

/* =============================================================================
   Utilities
   ========================================================================== */

function weiToEtn(wei?: any): number | undefined {
  if (wei == null) return undefined;
  const s = typeof wei === "string" ? wei : wei.toString?.() ?? String(wei);
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return n / 1e18;
}

function asStd(s: string | null): "ERC721" | "ERC1155" | undefined {
  return s === "ERC721" || s === "ERC1155" ? s : undefined;
}

/* =============================================================================
   Shape an NFT for the client
   ========================================================================== */
function shapeNft(n: {
  id: string;
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
  description: string | null;
  traits: any | null;
  attributes: any | null;
  tokenUri: string | null;
  contract: string;
  standard: string | null;
  royaltyBps: number | null;
  royaltyRecipient: string | null;
  ownerId: string | null;
  collectionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  listingEntries?: { priceEtnWei: any }[];
  auctionEntries?: { id: string }[];
}) {
  const lowest = n.listingEntries?.[0]?.priceEtnWei ?? null;
  const listingPriceWei = lowest ? lowest.toString() : undefined;
  const listingPrice = lowest ? weiToEtn(lowest) : undefined;

  return {
    id: n.id,
    nftAddress: n.contract,
    tokenId: n.tokenId,
    name: n.name ?? undefined,
    image: n.imageUrl ?? undefined,
    description: n.description ?? undefined,
    traits: n.traits ?? undefined,
    attributes: n.attributes ?? undefined,
    tokenUri: n.tokenUri ?? undefined,
    contract: n.contract,
    standard: asStd(n.standard) ?? undefined,
    royaltyBps: n.royaltyBps ?? undefined,
    royaltyRecipient: n.royaltyRecipient ?? undefined,
    ownerId: n.ownerId ?? undefined,
    collectionId: n.collectionId ?? undefined,
    isListed: listingPriceWei != null,
    listingPrice,      // ETN
    listingPriceWei,   // wei string
    isAuctioned: (n.auctionEntries?.length ?? 0) > 0,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

/* =============================================================================
   Shared builders
   ========================================================================== */

async function ensureUser(address: string) {
  const existing = await prisma.user.findFirst({
    where: { walletAddress: { equals: address, mode: Prisma.QueryMode.insensitive } },
  });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      walletAddress: address, // preserve original casing
      username: `${address.slice(0, 6)}...${address.slice(-4)}`,
      profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`,
      profileBanner:
        "https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png",
    },
  });
}

/**
 * ✅ Unified item total that EXACTLY matches what the grid can show:
 *    count rows in `NFT` with `status=SUCCESS` that match ANY of:
 *    - owned ERC721 (owner.walletAddress == address)
 *    - ERC1155 holdings (contract+tokenId in Erc1155Holding with balance>0)
 *    - Single-1155 balances (single1155Id in Erc1155Balance with balance>0)
 *
 * We do a single `prisma.nFT.count` with { AND: [status=SUCCESS], OR: [...] }.
 * This avoids double counting and ignores tokens we don't (yet) have rows for.
 */
async function computeItemsTotal(address: string): Promise<number> {
  // 1155 holdings (generic)
  const holdings = await prisma.erc1155Holding.findMany({
    where: {
      ownerAddress: { equals: address, mode: Prisma.QueryMode.insensitive },
      balance: { gt: 0 },
    },
    select: { contract: true, tokenId: true },
    take: 5000,
  });

  // Single-1155 balances (platform contracts)
  const s1155 = await prisma.erc1155Balance.findMany({
    where: {
      ownerAddress: { equals: address, mode: Prisma.QueryMode.insensitive },
      balance: { gt: 0 },
    },
    select: { single1155Id: true },
    take: 5000,
  });

  const orScope: Prisma.NFTWhereInput[] = [
    { owner: { is: { walletAddress: { equals: address, mode: "insensitive" } } } },
    ...holdings.map((h) => ({
      AND: [
        { contract: { equals: h.contract, mode: Prisma.QueryMode.insensitive } },
        { tokenId: h.tokenId },
      ],
    })),
  ];

  if (s1155.length) {
    orScope.push({ single1155Id: { in: s1155.map((b) => b.single1155Id) } });
  }

  // final count strictly from NFT table, SUCCESS only
  return prisma.nFT.count({
    where: { AND: [{ status: NftStatus.SUCCESS }], OR: orScope },
  });
}

/** Resolve the NFC contract (env first, fallback by name). */
async function resolveNfcContract() {
  const env = process.env.PANTHART_NFC_CONTRACT?.trim();
  if (env) return env;
  const col = await prisma.collection.findFirst({
    where: { name: { equals: "Non-Fungible Comrades", mode: Prisma.QueryMode.insensitive } },
    select: { contract: true },
  });
  return col?.contract ?? null;
}

/* =============================================================================
   GET /api/profile/me
   ========================================================================== */
export async function GET(req: Request) {
  await prismaReady;

  const address = req.headers.get("x-user-address");
  if (!address) return NextResponse.json({ error: "No address" }, { status: 401 });

  const user = await ensureUser(address);

  // ✅ exact same counting logic the grid uses
  const itemsTotal = await computeItemsTotal(address);

  // Legends (NFC) count
  const NFC_CONTRACT = await resolveNfcContract();
  const legendsComrades = NFC_CONTRACT
    ? await prisma.nFT.count({
        where: {
          status: NftStatus.SUCCESS,
          contract: { equals: NFC_CONTRACT, mode: Prisma.QueryMode.insensitive },
          owner: { is: { walletAddress: { equals: address, mode: "insensitive" } } },
        },
      })
    : 0;

  // Owned ERC721s (plus any 1155 rows that happen to have ownerId set)
  const owned = await prisma.nFT.findMany({
    where: {
      status: NftStatus.SUCCESS,
      owner: { is: { walletAddress: { equals: address, mode: "insensitive" } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true, tokenId: true, name: true, imageUrl: true, description: true,
      traits: true, attributes: true, tokenUri: true, contract: true, standard: true,
      royaltyBps: true, royaltyRecipient: true, ownerId: true, collectionId: true,
      createdAt: true, updatedAt: true,
      listingEntries: { where: { status: ListingStatus.ACTIVE }, orderBy: { priceEtnWei: "asc" }, take: 1, select: { priceEtnWei: true } },
      auctionEntries: { where: { status: AuctionStatus.ACTIVE }, take: 1, select: { id: true } },
    },
  });

  // General 1155 holdings -> fetch matching SUCCESS NFTs
  const holdings = await prisma.erc1155Holding.findMany({
    where: { ownerAddress: { equals: address, mode: Prisma.QueryMode.insensitive }, balance: { gt: 0 } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const holdingNfts = holdings.length
    ? await prisma.nFT.findMany({
        where: {
          status: NftStatus.SUCCESS,
          OR: holdings.map((h) => ({
            contract: { equals: h.contract, mode: Prisma.QueryMode.insensitive },
            tokenId: h.tokenId,
          })),
        },
        select: {
          id: true, tokenId: true, name: true, imageUrl: true, description: true,
          traits: true, attributes: true, tokenUri: true, contract: true, standard: true,
          royaltyBps: true, royaltyRecipient: true, ownerId: true, collectionId: true,
          createdAt: true, updatedAt: true,
          listingEntries: { where: { status: ListingStatus.ACTIVE }, orderBy: { priceEtnWei: "asc" }, take: 1, select: { priceEtnWei: true } },
          auctionEntries: { where: { status: AuctionStatus.ACTIVE }, take: 1, select: { id: true } },
        },
      })
    : [];

  const holdingsNfts = holdings.map((h) => {
    const row =
      holdingNfts.find(
        (r) =>
          r.contract.localeCompare(h.contract, undefined, { sensitivity: "accent" }) === 0 &&
          r.tokenId === h.tokenId
      ) ?? null;

    // Only include if we have a SUCCESS NFT row (else the grid can’t show it)
    if (!row) return null;
    return { balance: h.balance, updatedAt: h.updatedAt.toISOString(), nft: shapeNft(row) };
  }).filter(Boolean) as Array<{ balance: number; updatedAt: string; nft: ReturnType<typeof shapeNft> }>;

  // Single-1155 balances -> SUCCESS NFTs by single1155Id
  const s1155Balances = await prisma.erc1155Balance.findMany({
    where: { ownerAddress: { equals: address, mode: Prisma.QueryMode.insensitive }, balance: { gt: 0 } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { single1155Id: true, balance: true, updatedAt: true },
  });

  const s1155Ids = s1155Balances.map((b) => b.single1155Id);
  const s1155Nfts = s1155Ids.length
    ? await prisma.nFT.findMany({
        where: { status: NftStatus.SUCCESS, single1155Id: { in: s1155Ids } },
        select: {
          single1155Id: true,
          id: true, tokenId: true, name: true, imageUrl: true, description: true,
          traits: true, attributes: true, tokenUri: true, contract: true, standard: true,
          royaltyBps: true, royaltyRecipient: true, ownerId: true, collectionId: true,
          createdAt: true, updatedAt: true,
          listingEntries: { where: { status: ListingStatus.ACTIVE }, orderBy: { priceEtnWei: "asc" }, take: 1, select: { priceEtnWei: true } },
          auctionEntries: { where: { status: AuctionStatus.ACTIVE }, take: 1, select: { id: true } },
        },
      })
    : [];

  const s1155Holdings = s1155Balances.map((b) => {
    const found = s1155Nfts.find((n) => n.single1155Id === b.single1155Id);
    if (!found) return null;
    const { single1155Id: _drop, ...rest } = found as any;
    return { balance: b.balance, updatedAt: b.updatedAt.toISOString(), nft: shapeNft(rest) };
  }).filter(Boolean) as Array<{ balance: number; updatedAt: string; nft: ReturnType<typeof shapeNft> }>;

  const profile = {
    walletAddress: user.walletAddress,
    username: user.username,
    profileAvatar: user.profileAvatar,
    profileBanner: user.profileBanner,
    instagram: user.instagram ?? undefined,
    x: user.x ?? undefined,
    website: user.website ?? undefined,
    telegram: user.telegram ?? undefined,
    bio: user.bio ?? undefined,
    ownedNFTs: owned.map(shapeNft),
    erc1155Holdings: [...holdingsNfts, ...s1155Holdings], // only SUCCESS-backed items
    itemsTotal,                    // ✅ EXACT MATCH with grid
    legendsComrades,
  };

  return NextResponse.json(profile, { status: 200 });
}

/* =============================================================================
   PATCH /api/profile/me
   ========================================================================== */
export async function PATCH(req: Request) {
  await prismaReady;

  const address = req.headers.get("x-user-address");
  if (!address) return NextResponse.json({ error: "No address" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Partial<{
    username: string;
    profileBanner: string | null;
    profileAvatar: string;
    instagram: string | null;
    x: string | null;
    website: string | null;
    telegram: string | null;
    bio: string | null;
  }>;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const user = await ensureUser(address);

  const data: Record<string, any> = {};
  if (body.username !== undefined) data.username = body.username.trim();
  if (body.profileBanner !== undefined) data.profileBanner = body.profileBanner;
  if (body.profileAvatar !== undefined) data.profileAvatar = body.profileAvatar;
  if (body.instagram !== undefined) data.instagram = body.instagram;
  if (body.x !== undefined) data.x = body.x;
  if (body.website !== undefined) data.website = body.website;
  if (body.telegram !== undefined) data.telegram = body.telegram;
  if (body.bio !== undefined) data.bio = body.bio?.trim() || null;

  const saved = await prisma.user.update({ where: { id: user.id }, data });

  // Rebuild counts/holdings the same way as GET so UI stays consistent
  const itemsTotal = await computeItemsTotal(address);

  const NFC_CONTRACT = await resolveNfcContract();
  const legendsComrades = NFC_CONTRACT
    ? await prisma.nFT.count({
        where: {
          status: NftStatus.SUCCESS,
          contract: { equals: NFC_CONTRACT, mode: Prisma.QueryMode.insensitive },
          owner: { is: { walletAddress: { equals: address, mode: "insensitive" } } },
        },
      })
    : 0;

  const owned = await prisma.nFT.findMany({
    where: {
      status: NftStatus.SUCCESS,
      owner: { is: { walletAddress: { equals: address, mode: "insensitive" } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true, tokenId: true, name: true, imageUrl: true, description: true,
      traits: true, attributes: true, tokenUri: true, contract: true, standard: true,
      royaltyBps: true, royaltyRecipient: true, ownerId: true, collectionId: true,
      createdAt: true, updatedAt: true,
      listingEntries: { where: { status: ListingStatus.ACTIVE }, orderBy: { priceEtnWei: "asc" }, take: 1, select: { priceEtnWei: true } },
      auctionEntries: { where: { status: AuctionStatus.ACTIVE }, take: 1, select: { id: true } },
    },
  });

  const holdings = await prisma.erc1155Holding.findMany({
    where: { ownerAddress: { equals: address, mode: Prisma.QueryMode.insensitive }, balance: { gt: 0 } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const holdingNfts = holdings.length
    ? await prisma.nFT.findMany({
        where: {
          status: NftStatus.SUCCESS,
          OR: holdings.map((h) => ({
            contract: { equals: h.contract, mode: Prisma.QueryMode.insensitive },
            tokenId: h.tokenId,
          })),
        },
        select: {
          id: true, tokenId: true, name: true, imageUrl: true, description: true,
          traits: true, attributes: true, tokenUri: true, contract: true, standard: true,
          royaltyBps: true, royaltyRecipient: true, ownerId: true, collectionId: true,
          createdAt: true, updatedAt: true,
          listingEntries: { where: { status: ListingStatus.ACTIVE }, orderBy: { priceEtnWei: "asc" }, take: 1, select: { priceEtnWei: true } },
          auctionEntries: { where: { status: AuctionStatus.ACTIVE }, take: 1, select: { id: true } },
        },
      })
    : [];

  const holdingsNfts = holdings.map((h) => {
    const row =
      holdingNfts.find(
        (r) =>
          r.contract.localeCompare(h.contract, undefined, { sensitivity: "accent" }) === 0 &&
          r.tokenId === h.tokenId
      ) ?? null;
    if (!row) return null;
    return { balance: h.balance, updatedAt: h.updatedAt.toISOString(), nft: shapeNft(row) };
  }).filter(Boolean) as Array<{ balance: number; updatedAt: string; nft: ReturnType<typeof shapeNft> }>;

  const s1155Balances = await prisma.erc1155Balance.findMany({
    where: { ownerAddress: { equals: address, mode: Prisma.QueryMode.insensitive }, balance: { gt: 0 } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { single1155Id: true, balance: true, updatedAt: true },
  });

  const s1155Ids = s1155Balances.map((b) => b.single1155Id);
  const s1155Nfts = s1155Ids.length
    ? await prisma.nFT.findMany({
        where: { status: NftStatus.SUCCESS, single1155Id: { in: s1155Ids } },
        select: {
          single1155Id: true,
          id: true, tokenId: true, name: true, imageUrl: true, description: true,
          traits: true, attributes: true, tokenUri: true, contract: true, standard: true,
          royaltyBps: true, royaltyRecipient: true, ownerId: true, collectionId: true,
          createdAt: true, updatedAt: true,
          listingEntries: { where: { status: ListingStatus.ACTIVE }, orderBy: { priceEtnWei: "asc" }, take: 1, select: { priceEtnWei: true } },
          auctionEntries: { where: { status: AuctionStatus.ACTIVE }, take: 1, select: { id: true } },
        },
      })
    : [];

  const s1155Holdings = s1155Balances.map((b) => {
    const found = s1155Nfts.find((n) => n.single1155Id === b.single1155Id);
    if (!found) return null;
    const { single1155Id: _drop, ...rest } = found as any;
    return { balance: b.balance, updatedAt: b.updatedAt.toISOString(), nft: shapeNft(rest) };
  }).filter(Boolean) as Array<{ balance: number; updatedAt: string; nft: ReturnType<typeof shapeNft> }>;

  const profile = {
    walletAddress: saved.walletAddress,
    username: saved.username,
    profileAvatar: saved.profileAvatar,
    profileBanner: saved.profileBanner,
    instagram: saved.instagram ?? undefined,
    x: saved.x ?? undefined,
    website: saved.website ?? undefined,
    telegram: saved.telegram ?? undefined,
    bio: saved.bio ?? undefined,
    ownedNFTs: owned.map(shapeNft),
    erc1155Holdings: [...holdingsNfts, ...s1155Holdings],
    itemsTotal,     // ✅ matches grid
    legendsComrades,
  };

  return NextResponse.json(profile, { status: 200 });
}
