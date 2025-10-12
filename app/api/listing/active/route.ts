// app/api/listing/active/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { ListingStatus, CurrencyKind } from "@/lib/generated/prisma";

// tiny helper – UI-friendly decimal (ok to use Number for display)
function fromWeiStr(wei?: any, decimals = 18): string | undefined {
  const n = Number((wei as any)?.toString?.() ?? wei);
  if (!Number.isFinite(n)) return undefined;
  return (n / 10 ** decimals).toString();
}

/** Expand scientific-notation numbers to a plain integer string (positive exponents). */
function expandSciToIntegerString(s: string): string {
  s = s.trim().toLowerCase();
  if (!/e/.test(s)) return s;

  const [mant, expStr] = s.split("e");
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp)) return s;

  const sign = mant.startsWith("-") ? "-" : "";
  const m = mant.replace(/^[+-]/, "");
  const [intPart, fracPartRaw = ""] = m.split(".");
  const fracPart = fracPartRaw.replace(/[^0-9]/g, "");

  if (exp >= 0) {
    const needed = exp - fracPart.length;
    if (needed >= 0) {
      return (sign + intPart + fracPart + "0".repeat(needed)).replace(/^(-?)0+(\d)/, "$1$2");
    } else {
      const split = fracPart.length + needed; // needed is negative
      return (sign + intPart + fracPart.slice(0, split)).replace(/^(-?)0+(\d)/, "$1$2");
    }
  } else {
    // value < 1; for base units we return "0"
    return "0";
  }
}

/** Convert Prisma Decimal / string / number to BigInt safely (no scientific notation). */
function toBigIntSafe(x: any): bigint | null {
  if (x == null) return null;

  // Prisma Decimal: prefer toFixed(0) to avoid exponent output
  if (typeof x === "object" && typeof x.toFixed === "function") {
    const s = x.toFixed(0);
    return BigInt(s.replace(/^0+$/, "0"));
  }

  let s = String(x).trim();
  if (/e/i.test(s)) s = expandSciToIntegerString(s);
  s = s.replace(/\..*$/, "");            // drop any fractional part
  s = s.replace(/^[-+]?0+(?=\d)/, (m) => (m.startsWith("-") ? "-" : "")); // strip leading zeros
  if (s === "" || s === "-" || s === "+") s = "0";
  return BigInt(s);
}

export async function GET(req: NextRequest) {
  await prismaReady;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 24), 60);
  const cursor = searchParams.get("cursor");

  // optional filters
  const contractParam = searchParams.get("contract") || undefined;
  const tokenIdParam = searchParams.get("tokenId") || undefined;

  // fast-path count (for token page "View all" buttons)
  const countOnly = searchParams.get("count") === "1";

  try {
    // Base where: active & not ended (endTime is null OR > now)
    const whereBase: any = {
      status: ListingStatus.ACTIVE,
      OR: [{ endTime: null }, { endTime: { gt: new Date() } }],
    };

    // Add optional NFT filter (case-insensitive contract, exact tokenId)
    if (contractParam || tokenIdParam) {
      whereBase.nft = {};
      if (contractParam) {
        whereBase.nft.contract = {
          equals: contractParam,
          mode: "insensitive" as const,
        };
      }
      if (tokenIdParam) {
        whereBase.nft.tokenId = tokenIdParam;
      }
    }

    if (countOnly) {
      const count = await prisma.marketplaceListing.count({ where: whereBase });
      return NextResponse.json({ count });
    }

    const items = await prisma.marketplaceListing.findMany({
      where: whereBase,
      orderBy: { startTime: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        startTime: true,
        endTime: true,
        sellerAddress: true,
        quantity: true,
        priceEtnWei: true,
        priceTokenAmount: true,
        currency: {
          select: {
            id: true,
            symbol: true,
            decimals: true,
            kind: true,
            tokenAddress: true,
          },
        },
        nft: {
          select: {
            contract: true,
            tokenId: true,
            name: true,
            imageUrl: true,
            standard: true,
          },
        },
      },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, -1) : items;

    const now = Date.now();

    const mapped = page.map((l) => {
      const isNative =
        (l.currency?.kind ?? CurrencyKind.NATIVE) === CurrencyKind.NATIVE;
      const decimals = isNative ? 18 : l.currency?.decimals ?? 18;

      // DB stores TOTAL for the lot (1155) / qty=1 for 721
      const totalWeiRaw = (isNative ? l.priceEtnWei : l.priceTokenAmount) ?? null;

      const qty = Number(l.quantity || 1);
      const totalWei = toBigIntSafe(totalWeiRaw);
      const unitWei =
        totalWei != null && qty > 0 ? totalWei / BigInt(qty) : null;

      const startISO = l.startTime.toISOString();
      const endISO = l.endTime ? l.endTime.toISOString() : null;

      const startMs = l.startTime.getTime();
      const endMs = l.endTime ? l.endTime.getTime() : null;
      const isLive = now >= startMs && (!endMs || now <= endMs);

      return {
        id: l.id,
        nft: {
          contract: l.nft.contract,
          tokenId: l.nft.tokenId,
          name:
            l.nft.name ??
            `${l.nft.contract.slice(0, 6)}…${l.nft.contract.slice(-4)} #${l.nft.tokenId}`,
          image: l.nft.imageUrl,
          standard: l.nft.standard ?? "ERC721",
        },
        startTime: startISO,
        endTime: endISO,
        isLive,
        currency: {
          id: l.currency?.id ?? null,
          kind: isNative ? "NATIVE" : "ERC20",
          symbol: l.currency?.symbol ?? (isNative ? "ETN" : "ERC20"),
          decimals,
          tokenAddress: l.currency?.tokenAddress ?? null,
        },
        price: {
          unitWei: unitWei != null ? unitWei.toString() : null,
          unit: unitWei != null ? fromWeiStr(unitWei, decimals) : null,
          totalWei: totalWei != null ? totalWei.toString() : null,
          total: totalWei != null ? fromWeiStr(totalWei, decimals) : null,
        },
        sellerAddress: l.sellerAddress,
        quantity: qty,
      };
    });

    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({ items: mapped, nextCursor });
  } catch (e) {
    console.error("[api listing active] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
