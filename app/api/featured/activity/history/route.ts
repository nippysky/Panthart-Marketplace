// app/api/featured/activity/history/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

/** LiveEvent shape expected by the client */
type LiveEvent = {
  kind: "BidPlaced" | "BidIncreased";
  at: number; // epoch ms
  txHash: string | null;
  cycleId: string; // bytes32 hex (FeaturedCycle.cycleId)
  bidder: string; // wallet address
  newTotalWei: string; // decimal string
  collection: string; // contract address
  bidderProfile: {
    username: string | null;
    profileAvatar: string | null;
    walletAddress: string;
  };
  collectionMeta: {
    name: string;
    contract: string;
    logoUrl: string | null;
    coverUrl: string | null;
    itemsCount: number;
  };
};

/**
 * Local row type with the relations we `include` below.
 * (We cast the Prisma result to this to avoid TS complaining that
 * `bidder`/`collection` don't exist on the base model.)
 */
type RowWithRels = {
  id: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  cycleId: string; // FK to FeaturedCycle.id
  bidderAddress: string;
  bidderUserId: string | null;
  collectionContract: string;
  totalBidWei: { toString(): string } | string;
  txCount: number;
  lastTxHash: string | null;
  bidder?: {
    walletAddress: string;
    username: string;
    profileAvatar: string;
  } | null;
  collection?: {
    name: string;
    contract: string;
    logoUrl: string | null;
    coverUrl: string | null;
    itemsCount: number;
  } | null;
};

export async function GET(req: NextRequest) {
  await prismaReady;

  const url = new URL(req.url);
  const cycleIdHex = (url.searchParams.get("cycleId") || "").trim();
  const take = Math.min(Math.max(Number(url.searchParams.get("take") || 30), 1), 50);

  // Resolve cycle: use explicit ?cycleId= if provided, else latest ACTIVE
  const cycle =
    cycleIdHex
      ? await prisma.featuredCycle.findUnique({
          where: { cycleId: cycleIdHex },
          select: { id: true, cycleId: true },
        })
      : await prisma.featuredCycle.findFirst({
          where: { status: "ACTIVE" },
          orderBy: [{ startAt: "desc" }],
          select: { id: true, cycleId: true },
        });

  if (!cycle) {
    return NextResponse.json({ ok: true, events: [] as LiveEvent[] }, { status: 200 });
  }

  // Pull latest FeaturedBid rows for that cycle (newest first)
  const rows = (await prisma.featuredBid.findMany({
    where: { cycleId: cycle.id },
    orderBy: [{ updatedAt: "desc" }],
    take,
    include: {
      bidder: { select: { username: true, profileAvatar: true, walletAddress: true } },
      collection: {
        select: {
          name: true,
          logoUrl: true,
          coverUrl: true,
          itemsCount: true,
          contract: true,
        },
      },
    },
  })) as unknown as RowWithRels[];

  // Map to the LiveEvent shape
  const events: LiveEvent[] = rows.map((r) => ({
    kind: (r.txCount || 0) <= 1 ? "BidPlaced" : "BidIncreased",
    at:
      r.updatedAt instanceof Date
        ? r.updatedAt.getTime()
        : new Date(String(r.updatedAt)).getTime(),
    txHash: r.lastTxHash ?? null,
    cycleId: cycle.cycleId, // public bytes32 id
    bidder: r.bidderAddress,
    newTotalWei: typeof r.totalBidWei === "string" ? r.totalBidWei : r.totalBidWei.toString(),
    collection: r.collectionContract,
    bidderProfile: {
      username: r.bidder?.username ?? null,
      profileAvatar: r.bidder?.profileAvatar ?? null,
      walletAddress: r.bidder?.walletAddress ?? r.bidderAddress,
    },
    collectionMeta: {
      name: r.collection?.name ?? "(Unknown Collection)",
      contract: r.collection?.contract ?? r.collectionContract,
      logoUrl: r.collection?.logoUrl ?? null,
      coverUrl: r.collection?.coverUrl ?? null,
      itemsCount: r.collection?.itemsCount ?? 0,
    },
  }));

  return NextResponse.json({ ok: true, events }, { status: 200 });
}
