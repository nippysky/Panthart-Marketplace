// app/api/pending-actions/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { PendingChainActionType, PendingStatus } from "@/lib/generated/prisma";
import { publish, auctionTopic, walletTopic } from "@/lib/server/sse";
import { readActiveAuctionSnapshot } from "@/lib/server/chain/marketplaceRead";

/* -------------------------------------------------------------------------- */
/* utils                                                                      */
/* -------------------------------------------------------------------------- */

function isHex32(s?: string): s is `0x${string}` {
  return !!s && /^0x[0-9a-fA-F]{64}$/.test(s);
}
function isHexAddr(s?: string): s is `0x${string}` {
  return !!s && /^0x[0-9a-fA-F]{40}$/.test(s);
}
const EXPECTED_CHAIN = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID || 52014
);

/** Normalize anything (Decimal/string/number incl. scientific) to an integer string */
function normalizeIntString(x: unknown): string {
  if (x == null) return "0";
  if (typeof x === "bigint") return x.toString();
  let s = typeof x === "string" ? x : String((x as any)?.toString?.() ?? x);
  s = s.trim();
  if (s === "" || s === "-0" || s === "+0") return "0";
  if (/^[+-]?\d+$/.test(s)) return s;
  if (/^[+-]?\d+\.\d+$/.test(s)) {
    const [i, f] = s.split(".");
    if (/^0+$/.test(f)) return i;
  }
  const m = s.match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (m) {
    const sign = m[1] || "";
    const i = m[2];
    const f = m[3] || "";
    const e = parseInt(m[4], 10);
    const digits = i + f;
    if (e >= 0) {
      const zeros = e - f.length;
      if (zeros >= 0) return (sign === "-" ? "-" : "") + digits + "0".repeat(zeros);
      const cut = digits.length + zeros;
      if (cut <= 0) return "0";
      return (sign === "-" ? "-" : "") + digits.slice(0, cut);
    }
    return "0";
  }
  const fallback = s.replace(/^[^+\-0-9]+/, "").replace(/[^\d+-]/g, "");
  return fallback === "" || fallback === "+" || fallback === "-" ? "0" : fallback;
}

function toBigInt(x: unknown): bigint {
  try {
    return BigInt(normalizeIntString(x));
  } catch {
    return 0n;
  }
}

function isDbIdOrNumeric(x?: string | null): x is string {
  return !!x && /^[A-Za-z0-9_-]+$/.test(x);
}

/* -------------------------------------------------------------------------- */
/* POST                                                                        */
/* -------------------------------------------------------------------------- */
/**
 * Body for bids:
 * {
 *   "type": "NFT_AUCTION_BID",
 *   "txHash": "0x…",
 *   "from": "0x…",
 *   "chainId": 52014,
 *   "payload": {
 *     "auctionId": "<DB auction id>",
 *     "bidAmountBaseUnits": "1234500000000000000"
 *   },
 *   "relatedId": "<same as auctionId>"
 * }
 */
export async function POST(req: NextRequest) {
  await prismaReady;

  try {
    const body = await req.json();
    const typeStr = String(body?.type || "");
    const txHash = String(body?.txHash || "");
    const from = String(body?.from || "");
    const chainId = Number(body?.chainId);
    const payload = body?.payload ?? null;

    // basic guards
    if (
      !typeStr ||
      !isHex32(txHash) ||
      !isHexAddr(from) ||
      !Number.isFinite(chainId) ||
      chainId !== EXPECTED_CHAIN ||
      !payload
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // idempotent on txHash (retry-safe)
    const existing = await prisma.pendingChainAction.findUnique({
      where: { txHash },
    });
    if (existing) return NextResponse.json(existing, { status: 200 });

    // -----------------------------------------------------------------------
    // Bid handling
    // -----------------------------------------------------------------------
    if (typeStr === "NFT_AUCTION_BID") {
      const auctionId = String(payload?.auctionId || "");
      const bidAmountBaseUnits = String(payload?.bidAmountBaseUnits || "");

      if (!isDbIdOrNumeric(auctionId)) {
        return NextResponse.json({ error: "Invalid auctionId" }, { status: 400 });
      }
      if (!/^\d+$/.test(bidAmountBaseUnits)) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }

      // DB is the authority for currency; ignore any client currencyId
      const dbAuction = await prisma.auction.findUnique({
        where: { id: auctionId },
        select: {
          id: true,
          status: true,
          endTime: true,
          sellerAddress: true,
          nft: { select: { contract: true, tokenId: true, standard: true } },
          currency: { select: { id: true, tokenAddress: true } },
          currencyId: true,
        },
      });
      if (!dbAuction) {
        return NextResponse.json({ error: "Auction not found" }, { status: 404 });
      }
      const derivedCurrencyId = dbAuction.currencyId ?? null;

      // Chain guard (soft): read current snapshot; only block on clear errors.
      try {
        const MARKETPLACE = process.env
          .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
        const collection = dbAuction.nft?.contract as `0x${string}`;
        const tokenId = toBigInt(dbAuction.nft?.tokenId || "0");
        const standard = (dbAuction.nft?.standard || "ERC721") as "ERC721" | "ERC1155";
        const seller = dbAuction.sellerAddress as `0x${string}` | null;

        const snap = await readActiveAuctionSnapshot({
          marketplace: MARKETPLACE,
          collection,
          tokenId,
          standard,
          seller: standard === "ERC1155" ? (seller || undefined) : undefined,
        });

        // --- patched post-facto validation ---------------------------------
        if (snap) {
          const nowSec = Math.floor(Date.now() / 1000);
          if (snap.row.end <= nowSec) {
            return NextResponse.json(
              { error: "Auction already ended" },
              { status: 400 }
            );
          }

          const highest = snap.row.highestBid ?? 0n;
          const start = snap.row.startPrice ?? 0n;
          const offer = toBigInt(bidAmountBaseUnits);

          // If there was no prior bid, offer must clear start price.
          // If there was a prior bid, offer must be >= the snapshot's highest.
          // (If the snapshot already includes *this* new bid, offer == highest is OK.)
          if (highest === 0n) {
            if (offer < start) {
              return NextResponse.json(
                { error: "Bid below start price" },
                { status: 400 }
              );
            }
          } else {
            if (offer < highest) {
              return NextResponse.json(
                { error: "Bid below current highest" },
                { status: 400 }
              );
            }
          }
        } else {
          console.warn(
            "[pending-actions] snapshot unavailable; proceeding without guard"
          );
        }
        // -------------------------------------------------------------------
      } catch (e) {
        console.warn(
          "[pending-actions] chain guard soft-fail:",
          (e as any)?.message || e
        );
      }

      // Insert pending row
      const row = await prisma.pendingChainAction.create({
        data: {
          type: PendingChainActionType.NFT_AUCTION_BID,
          txHash,
          from,
          chainId,
          payload: {
            auctionId,
            bidAmountBaseUnits,
            currencyId: derivedCurrencyId, // authoritative from DB
          } as any,
          relatedId: auctionId,
          status: PendingStatus.PENDING,
        },
      });

      // Fan-out to SSE (auction room + bidder wallet room)
      const out = {
        txHash,
        from,
        auctionId,
        amount: bidAmountBaseUnits,
        currencyId: derivedCurrencyId,
        at: Date.now(),
      };
      publish(auctionTopic(auctionId), "bid_pending", out);
      publish(walletTopic(from), "bid_pending", out);

      return NextResponse.json(row, { status: 201 });
    }

    return NextResponse.json({ error: "Unsupported action type" }, { status: 400 });
  } catch (e) {
    console.error("[pending-actions POST] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* GET: list current user's pending actions (optional helper)                 */
/* /api/pending-actions?wallet=0xabc...&status=PENDING                        */
/* -------------------------------------------------------------------------- */
export async function GET(req: NextRequest) {
  await prismaReady;

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  const status = (searchParams.get("status") || "PENDING") as PendingStatus;

  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  const items = await prisma.pendingChainAction.findMany({
    where: { from: { equals: wallet, mode: "insensitive" }, status },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ items }, { status: 200 });
}
