// app/api/pending-actions/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import {
  PendingChainActionType,
  PendingStatus,
  AuctionStatus,
} from "@/lib/generated/prisma";
import { publish, auctionTopic, walletTopic } from "@/lib/server/sse";

/* ----------------------------- helpers ----------------------------- */
function isHex32(s?: string): s is `0x${string}` {
  return !!s && /^0x[0-9a-fA-F]{64}$/.test(s);
}
function isHexAddr(s?: string): s is `0x${string}` {
  return !!s && /^0x[0-9a-fA-F]{40}$/.test(s);
}
const EXPECTED_CHAIN = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID || 52014
);

/** Normalize anything (Decimal, string, number incl. scientific) to an integer string */
function normalizeIntString(x: unknown): string {
  if (x == null) return "0";
  if (typeof x === "bigint") return x.toString();

  let s: string;
  if (typeof x === "string") {
    s = x.trim();
  } else if (typeof x === "number") {
    // numbers may come in as 1e+21
    s = String(x);
  } else if ((x as any)?.toString) {
    s = String((x as any).toString());
  } else {
    s = String(x);
  }
  s = s.trim();

  if (s === "" || s === "-0" || s === "+0") return "0";

  // If already a plain integer
  if (/^[+-]?\d+$/.test(s)) return s;

  // If it's a pure decimal with only zero fractional part (e.g. "123.0000")
  if (/^[+-]?\d+\.\d+$/.test(s)) {
    const [intPart, frac] = s.split(".");
    if (/^0+$/.test(frac)) return intPart;
  }

  // Scientific notation: 1.23e+6, -4e18, etc.
  const m = s.match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (m) {
    const sign = m[1] || "";
    const intPart = m[2];
    const frac = m[3] || "";
    const exp = parseInt(m[4], 10);

    const digits = intPart + frac; // move decimal to the right over all frac digits first
    if (exp >= 0) {
      const zeros = exp - frac.length;
      if (zeros >= 0) {
        return (sign === "-" ? "-" : "") + digits + "0".repeat(zeros);
      } else {
        // Decimal point would end up inside the digits.
        // We only want integers; truncate toward zero.
        const cut = digits.length + zeros; // zeros is negative
        if (cut <= 0) return "0"; // < 1 after truncation
        return (sign === "-" ? "-" : "") + digits.slice(0, cut);
      }
    } else {
      // Negative exponent -> number < 1 in magnitude; truncates to 0 for integers
      return "0";
    }
  }

  // Fallback: drop anything that is not a digit (and keep an optional leading sign)
  const fallback = s.replace(/^[^+\-0-9]+/, "").replace(/[^\d+-]/g, "");
  if (fallback === "" || fallback === "+" || fallback === "-") return "0";
  return fallback;
}

// Normalize Prisma Decimal | number | string -> bigint (non-throwing)
function toBigInt(x: unknown | null | undefined): bigint {
  const s = normalizeIntString(x);
  try {
    return BigInt(s);
  } catch {
    // If something still slips by, be safe and return 0
    return 0n;
  }
}

// Accepts prisma cuid/cuid2 or numeric ids (future-proof)
function isDbIdOrNumeric(x?: string | null): x is string {
  if (!x) return false;
  // allow [a-z0-9_-] tokens (cuid/cuid2 variants) OR pure digits
  return /^[A-Za-z0-9_-]+$/.test(x);
}

/* ------------------------------ POST ------------------------------- */
/**
 * Body (examples)
 * - Bid:
 * {
 *   "type": "NFT_AUCTION_BID",
 *   "txHash": "0xabc...",
 *   "from": "0xUser...",
 *   "chainId": 52014,
 *   "payload": {
 *     "auctionId": "<DB auction id (cuid)>",
 *     "bidAmountBaseUnits": "1234500000000000000",
 *     "currencyId": "clCur..." | null   // null for native
 *   },
 *   "relatedId": "<same as payload.auctionId>"
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
    const relatedId = body?.relatedId ? String(body.relatedId) : null;

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

    // Idempotent on txHash
    const existing = await prisma.pendingChainAction.findUnique({
      where: { txHash },
    });
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    // ---- Implemented type(s)
    if (typeStr === "NFT_AUCTION_BID") {
      const auctionId = String(payload?.auctionId || "");
      const bidAmountBaseUnits = String(payload?.bidAmountBaseUnits || "");
      const currencyId = payload?.currencyId == null ? null : String(payload.currencyId);

      // RELAXED: accept cuid/cuid2 (alphanumeric/underscore/dash) OR numeric
      if (!isDbIdOrNumeric(auctionId)) {
        return NextResponse.json({ error: "Invalid auctionId" }, { status: 400 });
      }
      if (!/^\d+$/.test(bidAmountBaseUnits)) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }

      // Validate auction status + currency compatibility
      const auction = await prisma.auction.findUnique({
        where: { id: auctionId },
        select: {
          id: true,
          endTime: true,
          status: true,
          currencyId: true,
          highestBidEtnWei: true,
          highestBidTokenAmount: true,
          minIncrementEtnWei: true,
          minIncrementTokenAmount: true,
          startPriceEtnWei: true,
          startPriceTokenAmount: true,
        },
      });

      if (!auction || auction.status !== AuctionStatus.ACTIVE) {
        return NextResponse.json({ error: "Auction not active" }, { status: 400 });
      }

      const now = new Date();
      if (auction.endTime <= now) {
        return NextResponse.json({ error: "Auction ended" }, { status: 400 });
      }

      // Currency must match auction config (native => currencyId null; token => must equal)
      if ((auction.currencyId ?? null) !== (currencyId ?? null)) {
        return NextResponse.json({ error: "Currency mismatch" }, { status: 400 });
      }

      // Optional: min increment guard (robust conversions now)
      const isNative = !currencyId;
      const highestBI = toBigInt(isNative ? auction.highestBidEtnWei : auction.highestBidTokenAmount);
      const startBI   = toBigInt(isNative ? auction.startPriceEtnWei   : auction.startPriceTokenAmount);
      const incBI     = toBigInt(isNative ? auction.minIncrementEtnWei : auction.minIncrementTokenAmount);

      const minRequiredBI = highestBI > 0n ? highestBI + incBI : startBI;

      if (minRequiredBI > 0n && BigInt(bidAmountBaseUnits) < minRequiredBI) {
        return NextResponse.json(
          { error: "Bid below minimum increment" },
          { status: 400 }
        );
      }

      // Insert pending (enum value, not string)
      const row = await prisma.pendingChainAction.create({
        data: {
          type: PendingChainActionType.NFT_AUCTION_BID,
          txHash,
          from,
          chainId,
          payload: {
            auctionId,
            bidAmountBaseUnits,
            currencyId, // null for native, DB id for ERC-20
          } as any,
          relatedId: auctionId,
          status: PendingStatus.PENDING,
        },
      });

      // Push SSE "bid_pending" to auction room and wallet room (topics keyed by DB auction id)
      const payloadOut = {
        txHash,
        from,
        auctionId,
        amount: bidAmountBaseUnits,
        currencyId,
        at: Date.now(),
      };
      publish(auctionTopic(auctionId), "bid_pending", payloadOut);
      publish(walletTopic(from), "bid_pending", payloadOut);

      return NextResponse.json(row, { status: 201 });
    }

    // For now, reject other types explicitly (prevents enum mismatch)
    return NextResponse.json({ error: "Unsupported action type" }, { status: 400 });
  } catch (e) {
    console.error("[pending-actions POST] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ------------------------------- GET --------------------------------
 * Optional: list current user's pending actions (for a wallet)
 * /api/pending-actions?wallet=0xabc...&status=PENDING
 ---------------------------------------------------------------------*/
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
