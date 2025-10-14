// app/api/listings/fixed/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import {
  ListingStatus,
  NftStatus,
  Prisma,
} from "@/lib/generated/prisma";

/** parse cursor createdAt|id */
function parseCursor(cur?: string | null) {
  if (!cur) return null;
  const [ts, id] = cur.split("|");
  if (!ts || !id) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return { createdAt: d, id };
}

/** cheap decimal -> display (no big libs; trims trailing zeros) */
function toDisplay(baseUnits: string, decimals: number) {
  if (!baseUnits) return "0";
  const neg = baseUnits.startsWith("-");
  const raw = neg ? baseUnits.slice(1) : baseUnits;
  const pad = raw.padStart(decimals + 1, "0");
  const int = pad.slice(0, pad.length - decimals);
  const frac = pad.slice(pad.length - decimals).replace(/0+$/, "");
  const s = frac ? `${int}.${frac}` : int;
  return neg ? `-${s}` : s;
}


export async function GET(req: NextRequest) {
  await prismaReady;

  try {
    const { searchParams } = new URL(req.url);
    const pageSize = Math.min(Math.max(Number(searchParams.get("take") ?? 24), 6), 60);
    const cursorRaw = searchParams.get("cursor");
    const cursor = parseCursor(cursorRaw);

    const now = new Date();

    const where: Prisma.MarketplaceListingWhereInput = {
      status: ListingStatus.ACTIVE,
      startTime: { lte: now },
      OR: [{ endTime: null }, { endTime: { gt: now } }],
      nft: { status: NftStatus.SUCCESS, imageUrl: { not: null as any } },
    };

    const orderBy: Prisma.MarketplaceListingOrderByWithRelationInput[] = [
      { createdAt: "desc" },
      { id: "desc" },
    ];

    const results = await prisma.marketplaceListing.findMany({
      where,
      orderBy,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      take: pageSize,
      select: {
        id: true,
        createdAt: true,
        sellerAddress: true,
        quantity: true,
        priceEtnWei: true,
        priceTokenAmount: true,
        nft: {
          select: {
            contract: true,
            tokenId: true,
            name: true,
            imageUrl: true,
            standard: true,
          },
        },
        currency: {
          select: { symbol: true, decimals: true, kind: true, tokenAddress: true, id: true },
        },
      },
    });

    const items = results.map((row) => {
      const isNative =
        !row.currency || row.currency.tokenAddress == null || row.currency.symbol === "ETN";
      const decimals = row.currency?.decimals ?? 18;
      const raw = isNative ? String(row.priceEtnWei) : String(row.priceTokenAmount ?? "0");

      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        contract: row.nft.contract,
        tokenId: row.nft.tokenId,
        name: row.nft.name,
        media: row.nft.imageUrl,
        standard: row.nft.standard,      
        quantity: row.quantity,                
        seller: row.sellerAddress,
        price: toDisplay(raw, decimals),
        currency: {
          symbol: isNative ? "ETN" : row.currency?.symbol ?? "TOKEN",
          decimals,
          tokenAddress: row.currency?.tokenAddress ?? null,
          kind: row.currency?.kind ?? "NATIVE",
        },
        href: `/collections/${row.nft.contract}/${row.nft.tokenId}`,
      };
    });

    const nextCursor =
      results.length === pageSize
        ? `${results[results.length - 1].createdAt.toISOString()}|${results[results.length - 1].id}`
        : null;

    return NextResponse.json({ ok: true, items, nextCursor });
  } catch (e: any) {
    console.error("[GET /api/listings/fixed] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
