// app/api/auction/[auctionId]/bids/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import prisma, { prismaReady } from "@/lib/db";

// ---- helpers ---------------------------------------------------------------

// Expand things like "1.2e+21" into "1200000000000000000000"
function expandScientificInteger(s: string): string {
  const m = /^([+-])?(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(s);
  if (!m) return s;
  const sign = m[1] || "";
  const intPart = m[2];
  const fracPart = m[3] || "";
  let exp = parseInt(m[4], 10);

  if (exp >= 0) {
    // move decimal to the right
    if (fracPart.length <= exp) {
      return sign + intPart + fracPart + "0".repeat(exp - fracPart.length);
    } else {
      // there would be a decimal point left; but wei amounts should be integers.
      // We still return the precise integer by concatenation (since exp < fracPart.length).
      const whole = intPart + fracPart.slice(0, exp);
      const rest = fracPart.slice(exp).replace(/^0+$/, ""); // should be empty for integer wei
      return sign + whole + (rest ? rest : "");
    }
  } else {
    // move decimal to the left
    exp = -exp;
    if (exp >= intPart.length) {
      return sign + "0".repeat(exp - intPart.length) + intPart + fracPart;
    } else {
      const whole = intPart.slice(0, intPart.length - exp);
      const rest = intPart.slice(intPart.length - exp) + fracPart;
      // For wei, rest should be zeros; just concatenate (removes decimal point)
      return sign + whole + rest;
    }
  }
}

// Accept Prisma Decimal, bigint, string, or number → plain base-10 integer string
function toPlainIntString(x: unknown): string {
  if (x == null) return "0";
  if (typeof x === "bigint") return x.toString(10);
  if (typeof x === "number") {
    // numbers can be unsafe; still handle exponent if present
    const s = x.toString();
    return /e/i.test(s) ? expandScientificInteger(s) : Math.trunc(x).toString();
  }
  if (typeof x === "string") {
    const s = x.trim();
    return /e/i.test(s) ? expandScientificInteger(s) : s;
  }
  // Prisma Decimal has toFixed; use it to avoid exponents.
  const maybe = x as any;
  if (maybe && typeof maybe.toFixed === "function") {
    return maybe.toFixed(0); // integer wei
  }
  if (maybe && typeof maybe.toString === "function") {
    const s = maybe.toString();
    return /e/i.test(s) ? expandScientificInteger(s) : s;
  }
  return "0";
}

// ---------------------------------------------------------------------------

type Ctx = { params: Promise<{ auctionId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  await prismaReady;

  const { auctionId } = await ctx.params;

  if (!auctionId) {
    return NextResponse.json({ auctionId: "0", bids: [] }, { status: 200 });
  }

  try {
    // Get currency metadata once
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: {
        id: true,
        currency: { select: { id: true, symbol: true, decimals: true, tokenAddress: true } },
      },
    });

    if (!auction) {
      const resp = NextResponse.json({ auctionId: "0", bids: [] });
      resp.headers.set("Cache-Control", "s-maxage=10, stale-while-revalidate=60");
      return resp;
    }

    const currencySymbol = auction.currency?.symbol || "ETN";
    const currencyDecimals = auction.currency?.decimals ?? 18;
    const currencyAddress =
      (auction.currency?.tokenAddress as `0x${string}` | null) ??
      ("0x0000000000000000000000000000000000000000" as `0x${string}`);

    // Pull latest bids
    const rows = await prisma.auctionBid.findMany({
      where: { auctionId: auction.id },
      orderBy: { timestamp: "desc" },
      take: 200,
      select: {
        bidderAddress: true,
        amountWei: true, // Prisma Decimal or bigint-like
        txHash: true,
        timestamp: true,
      },
    });

    // Fetch bidder profiles (case-insensitive) in one round-trip
    const addrs = Array.from(new Set(rows.map((r) => r.bidderAddress.toLowerCase())));
    let profiles: Record<
      string,
      { walletAddress: string; username: string | null; profileAvatar: string | null }
    > = {};
    if (addrs.length > 0) {
      const users = await prisma.user.findMany({
        where: { walletAddress: { in: addrs, mode: "insensitive" } },
        select: { walletAddress: true, username: true, profileAvatar: true },
      });
      profiles = users.reduce((acc, u) => {
        acc[u.walletAddress.toLowerCase()] = {
          walletAddress: u.walletAddress,
          username: u.username,
          profileAvatar: u.profileAvatar,
        };
        return acc;
      }, {} as Record<string, { walletAddress: string; username: string | null; profileAvatar: string | null }>);
    }

    const bids = rows.map((r) => {
      const amountPlain = toPlainIntString(r.amountWei);
      const amountHuman = ethers.formatUnits(amountPlain, currencyDecimals);
      const key = r.bidderAddress.toLowerCase();
      const profile = profiles[key] ?? null;

      return {
        bidder: r.bidderAddress,
        amountHuman,
        time: r.timestamp.getTime(),
        txHash: r.txHash,
        bidderProfile: profile
          ? {
              walletAddress: profile.walletAddress,
              username: profile.username,
              imageUrl:
                profile.profileAvatar ??
                `https://api.dicebear.com/7.x/identicon/svg?seed=${profile.walletAddress}`,
            }
          : {
              walletAddress: r.bidderAddress,
              username: null,
              imageUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${r.bidderAddress}`,
            },
      };
    });

    const resp = NextResponse.json(
      {
        auctionId: auction.id,
        currency: { symbol: currencySymbol, decimals: currencyDecimals, address: currencyAddress },
        bids,
      },
      { status: 200 }
    );
    resp.headers.set("Cache-Control", "s-maxage=10, stale-while-revalidate=60");
    return resp;
  } catch (e) {
    console.error("[bids api] error:", e);
    return NextResponse.json({ auctionId: "0", bids: [] }, { status: 200 });
  }
}
