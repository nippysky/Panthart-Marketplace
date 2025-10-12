// app/api/featured/verify-tx/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { JsonRpcProvider, Contract, type LogDescription } from "ethers";
import prisma, { prismaReady } from "@/lib/db";
import FeaturedAuctionAbi from "@/lib/abis/FeaturedAuction.json";
import { pushFeaturedEvent } from "@/lib/sse";

const RPC_HTTP = process.env.RPC_URL!;
const FEATURED_ADDR = process.env.NEXT_PUBLIC_FEATURED_AUCTION_ADDRESS!;

const provider = new JsonRpcProvider(RPC_HTTP);
const auction = new Contract(FEATURED_ADDR, FeaturedAuctionAbi as any, provider);
const IFACE = auction.interface;

function asBytes32(hex: string) {
  if (!hex || !hex.startsWith("0x") || hex.length !== 66) throw new Error("Bad cycleId");
  return hex;
}

type Parsed =
  | {
      type: "BidPlaced";
      cycleId: string;
      bidder: string;
      collection: string;
      newTotalWei: string;
    }
  | {
      type: "BidIncreased";
      cycleId: string;
      bidder: string;
      addAmountWei: string;
      newTotalWei: string;
    };

function sameAddr(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** Safe wrapper: returns LogDescription or null, never throws */
function safeParseLog(log: any): LogDescription | null {
  try {
    const parsed = IFACE.parseLog(log as any);
    return parsed ?? null;
  } catch {
    return null;
  }
}

function tryParse(log: any): Parsed | null {
  if (!sameAddr(log?.address, FEATURED_ADDR)) return null;

  const parsed = safeParseLog(log);
  if (!parsed) return null;

  if (parsed.name === "BidPlaced") {
    // (bytes32 cycleId, address bidder, address collection, uint256 amountWei, uint256 newTotalWei)
    const cycleId = asBytes32(String(parsed.args[0]));
    const bidder = String(parsed.args[1]);
    const collection = String(parsed.args[2]);
    const newTotalWei = String(parsed.args[4]);
    return { type: "BidPlaced", cycleId, bidder, collection, newTotalWei };
  }

  if (parsed.name === "BidIncreased") {
    // (bytes32 cycleId, address bidder, uint256 addAmountWei, uint256 newTotalWei)
    const cycleId = asBytes32(String(parsed.args[0]));
    const bidder = String(parsed.args[1]);
    const addAmountWei = String(parsed.args[2]);
    const newTotalWei = String(parsed.args[3]);
    return { type: "BidIncreased", cycleId, bidder, addAmountWei, newTotalWei };
  }

  return null;
}

export async function POST(req: Request) {
  await prismaReady;

  const body = await req.json().catch(() => null);
  const txHash: string | undefined = body?.txHash;

  if (!txHash || typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ ok: false, error: "Invalid txHash" }, { status: 400 });
  }

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) {
    return NextResponse.json({ ok: false, error: "Tx not found or failed" }, { status: 400 });
  }

  // Must be sent to the featured contract
  const rcptTo = receipt.to ?? null;
  if (!sameAddr(rcptTo, FEATURED_ADDR)) {
    return NextResponse.json({ ok: false, error: "Tx not sent to featured auction" }, { status: 400 });
  }

  // Find first relevant event
  const logs = receipt.logs ?? [];
  let parsedEvent: Parsed | null = null;
  for (const log of logs) {
    parsedEvent = tryParse(log);
    if (parsedEvent) break;
  }

  if (!parsedEvent) {
    return NextResponse.json({ ok: false, error: "Relevant event not found in tx logs" }, { status: 400 });
  }

  // Ensure cycle exists in DB by bytes32 cycleId
  const cycle = await prisma.featuredCycle.findUnique({
    where: { cycleId: parsedEvent.cycleId },
    select: { id: true },
  });
  if (!cycle) {
    return NextResponse.json({ ok: false, error: "Cycle not found in DB" }, { status: 400 });
  }

  // Attach bidder user if present
  const bidderUser = await prisma.user.findUnique({
    where: { walletAddress: parsedEvent.bidder },
    select: { id: true, username: true, profileAvatar: true, walletAddress: true },
  });

  // If this is an increase and we don't have the collection from the event,
  // query the contract's bid struct to get it.
  // NOTE: getBid returns (collection address, totalWei uint256, exists bool) in that order.
  let collectionForCreate: string | undefined =
    parsedEvent.type === "BidPlaced" ? parsedEvent.collection : undefined;

  if (!collectionForCreate) {
    const bid = await auction.getBid(parsedEvent.cycleId, parsedEvent.bidder);
    // index 0 = collection address (index 1 = totalWei, index 2 = exists)
    collectionForCreate = String(bid[0]);
  }

  // Upsert bidder's running total for this cycle
  const updated = await prisma.featuredBid.upsert({
    where: {
      cycleId_bidderAddress: {
        cycleId: cycle.id, // FK to FeaturedCycle.id
        bidderAddress: parsedEvent.bidder,
      },
    },
    create: {
      cycleId: cycle.id,
      bidderAddress: parsedEvent.bidder,
      bidderUserId: bidderUser?.id ?? null,
      collectionContract: collectionForCreate!,
      totalBidWei: parsedEvent.newTotalWei,
      txCount: 1,
      lastTxHash: txHash,
    },
    update: {
      bidderUserId: bidderUser?.id ?? null,
      totalBidWei: parsedEvent.newTotalWei,
      txCount: { increment: 1 },
      lastTxHash: txHash,
    },
    include: {
      collection: {
        select: { name: true, logoUrl: true, coverUrl: true, itemsCount: true, contract: true },
      },
      bidder: { select: { username: true, profileAvatar: true, walletAddress: true } },
    },
  });

  // --- Build safe payloads for SSE (typed fallbacks for non-null Prisma fields) ---
  const bidderProfile = updated.bidder
    ? {
        username: updated.bidder.username,
        profileAvatar: updated.bidder.profileAvatar,
        walletAddress: updated.bidder.walletAddress,
      }
    : {
        username: null as string | null,
        profileAvatar: null as string | null,
        walletAddress: parsedEvent.bidder,
      };

  let collectionMeta:
    | {
        name: string;
        contract: string;
        logoUrl: string | null;
        coverUrl: string | null;
        itemsCount: number;
      }
    | null = updated.collection
    ? {
        name: updated.collection.name, // non-null
        contract: updated.collection.contract,
        logoUrl: updated.collection.logoUrl ?? null,
        coverUrl: updated.collection.coverUrl ?? null,
        itemsCount: updated.collection.itemsCount ?? 0,
      }
    : null;

  if (!collectionMeta) {
    const col = await prisma.collection.findFirst({
      where: { contract: { equals: updated.collectionContract, mode: "insensitive" } },
      select: { name: true, logoUrl: true, coverUrl: true, itemsCount: true, contract: true },
    });

    if (col) {
      collectionMeta = {
        name: col.name,
        contract: col.contract,
        logoUrl: col.logoUrl ?? null,
        coverUrl: col.coverUrl ?? null,
        itemsCount: col.itemsCount ?? 0,
      };
    } else {
      collectionMeta = {
        name: "(Unknown Collection)",
        contract: updated.collectionContract,
        logoUrl: null,
        coverUrl: null,
        itemsCount: 0,
      };
    }
  }

  // Broadcast to live feed
  pushFeaturedEvent({
    kind: parsedEvent.type, // "BidPlaced" | "BidIncreased"
    at: Date.now(),
    txHash,
    cycleId: parsedEvent.cycleId,
    bidder: updated.bidderAddress,
    newTotalWei: String(updated.totalBidWei),
    collection: updated.collectionContract,
    bidderProfile,
    collectionMeta,
  });

  return NextResponse.json({ ok: true, bid: updated });
}
