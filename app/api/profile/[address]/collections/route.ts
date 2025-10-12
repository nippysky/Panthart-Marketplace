// app/api/profile/[address]/collections/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma";
import { CurrencyKind } from "@/lib/generated/prisma";

/* ----------------------------- helpers ----------------------------- */
function encodeOffsetCursor(n: number) {
  return Buffer.from(String(n), "utf8").toString("base64url");
}
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
function parseRole(v: string | null): "owner" | "creator" | "both" {
  if (v === "owner" || v === "creator" || v === "both") return v;
  return "both";
}
function parseSort(v: string | null):
  | "recent" | "items" | "floor" | "volume" | "owners" | "name" {
  if (v === "items" || v === "floor" || v === "volume" || v === "owners" || v === "name") return v;
  return "recent";
}
/** Returned when a number is not available for this currency. */
const NA = null as number | null;

/* safe % change from two 24h windows */
function pctChange(curr: number, prev: number): number {
  if (prev > 0) return ((curr - prev) / prev) * 100;
  if (curr > 0) return 100;
  return 0;
}

/* ------------------------------- GET ------------------------------- */
/**
 * Cursor (offset) infinite-list of Collections that a user owns and/or created.
 * Currency-aware metrics via ?currency=native | <currencyId>.
 *
 * Returned extra fields:
 *   floor, floorBase, volumeTotal, volume24h, change24h, currency
 *
 * NOTE: We never lowercase addresses/contracts (queries are case-insensitive).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ address: string }> }
) {
  await prismaReady;
  const { address } = await ctx.params; // original casing preserved

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 20, 50));
  const offset = decodeOffsetCursor(url.searchParams.get("cursor"));
  const q = (url.searchParams.get("q") || "").trim();
  const role = parseRole(url.searchParams.get("role"));
  const sort = parseSort(url.searchParams.get("sort"));
  const currencyQ = (url.searchParams.get("currency") || "native").trim(); // 'native' | <currencyId>

  // Resolve currency
  let currencyMeta:
    | { id?: string; symbol: string; decimals: number; kind: "NATIVE" | "ERC20" }
    | null = null;

  if (currencyQ === "native") {
    currencyMeta = { symbol: "ETN", decimals: 18, kind: "NATIVE" };
  } else {
    const cur = await prisma.currency.findFirst({
      where: { id: currencyQ, active: true },
      select: { id: true, symbol: true, decimals: true, kind: true },
    });
    if (!cur) {
      return NextResponse.json({ error: "Unknown currency" }, { status: 400 });
    }
    currencyMeta = {
      id: cur.id,
      symbol: cur.symbol,
      decimals: cur.decimals ?? 18,
      kind: cur.kind === CurrencyKind.ERC20 ? "ERC20" : "NATIVE",
    };
  }

  // Ensure user row WITHOUT changing casing
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

  // Role filter
  const roleOr: Prisma.CollectionWhereInput[] = [];
  if (role === "owner" || role === "both") {
    roleOr.push({ ownerAddress: { equals: address, mode: "insensitive" } });
  }
  if (role === "creator" || role === "both") {
    roleOr.push({ creatorId: user.id });
  }

  const where: Prisma.CollectionWhereInput = {
    OR: roleOr.length ? roleOr : undefined,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { symbol: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // Neutral ordering (we do per-currency sort on the slice when needed)
  const orderByDefault: Prisma.CollectionOrderByWithRelationInput[] = (() => {
    switch (sort) {
      case "items":  return [{ itemsCount: "desc" }, { updatedAt: "desc" }];
      case "owners": return [{ ownersCount: "desc" }, { updatedAt: "desc" }];
      case "name":   return [{ name: "asc" }, { symbol: "asc" }];
      case "floor":
      case "volume":
      case "recent":
      default:       return [{ updatedAt: "desc" }];
    }
  })();

  // Pull a page *slice*
  const rows = await prisma.collection.findMany({
    where,
    orderBy: orderByDefault,
    skip: offset,
    take: limit + 1,
    select: {
      id: true,
      name: true,
      symbol: true,
      contract: true,
      description: true,
      logoUrl: true,
      coverUrl: true,
      standard: true,
      itemsCount: true,
      ownersCount: true,
      floorPrice: true,
      volume: true,
      change24h: true, // DB value (we'll overwrite with computed)
      ownerAddress: true,
      creatorId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const slice = rows.slice(0, limit);
  const nextCursor = hasMore ? encodeOffsetCursor(offset + limit) : null;

  if (slice.length === 0) {
    const resp = NextResponse.json(
      { items: [], nextCursor, currency: currencyMeta },
      { status: 200 }
    );
    resp.headers.set("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
    return resp;
  }

  /* ---------------- per-currency metrics (batched) ---------------- */
  const collectionIds = slice.map((c) => c.id);

  // 1) FLOOR (active, time-gated) in selected currency
  const now = new Date();
  const listingRows = await prisma.marketplaceListing.findMany({
    where: {
      status: "ACTIVE",
      startTime: { lte: now },
      nft: { collectionId: { in: collectionIds } },
      AND: [
        { OR: [{ endTime: null }, { endTime: { gt: now } }] },
        ...(currencyMeta.kind === "NATIVE"
          ? [
              {
                OR: [
                  { currencyId: null },
                  { currency: { kind: CurrencyKind.NATIVE } },
                ],
              },
            ]
          : [{ currencyId: currencyMeta.id! }]),
      ],
    },
    select: {
      priceEtnWei: true,
      priceTokenAmount: true,
      currency: { select: { decimals: true, kind: true, symbol: true } },
      nft: { select: { collectionId: true } },
    },
    orderBy: [{ priceEtnWei: "asc" }, { priceTokenAmount: "asc" }],
    take: 5000,
  });

  const floorMap = new Map<string, { base: string; human: number }>();
  for (const r of listingRows) {
    const cid = r.nft.collectionId!;
    let baseStr: string | null = null;
    let human = 0;
    if (currencyMeta.kind === "NATIVE") {
      baseStr = (r.priceEtnWei as any)?.toString?.() ?? null;
      if (!baseStr) continue;
      human = Number(baseStr) / 10 ** currencyMeta.decimals;
    } else {
      baseStr = (r.priceTokenAmount as any)?.toString?.() ?? null;
      if (!baseStr) continue;
      const dec = r.currency?.decimals ?? currencyMeta.decimals;
      human = Number(baseStr) / 10 ** dec;
    }
    const prev = floorMap.get(cid);
    if (!prev || human < prev.human) floorMap.set(cid, { base: baseStr, human });
  }

  // 2) VOLUME totals + last 24h (selected currency)
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const saleRowsAllTime = await prisma.marketplaceSale.findMany({
    where: {
      nft: { collectionId: { in: collectionIds } },
      AND: [
        ...(currencyMeta.kind === "NATIVE"
          ? [
              {
                OR: [
                  { currencyId: null },
                  { currency: { kind: CurrencyKind.NATIVE } },
                ],
              },
            ]
          : [{ currencyId: currencyMeta.id! }]),
      ],
    },
    select: {
      priceEtnWei: true,
      priceTokenAmount: true,
      timestamp: true,
      currency: { select: { decimals: true, kind: true } },
      nft: { select: { collectionId: true } },
    },
    orderBy: { timestamp: "desc" },
    take: 50_000,
  });

  const volTotalMap = new Map<string, number>(); // normalized
  const vol24hMap = new Map<string, number>();   // normalized

  for (const r of saleRowsAllTime) {
    const cid = r.nft.collectionId!;
    const in24 = r.timestamp >= since24h;
    let add = 0;
    if (currencyMeta.kind === "NATIVE") {
      const base = (r.priceEtnWei as any)?.toString?.();
      if (!base) continue;
      add = Number(base) / 10 ** currencyMeta.decimals;
    } else {
      const base = (r.priceTokenAmount as any)?.toString?.();
      if (!base) continue;
      const dec = r.currency?.decimals ?? currencyMeta.decimals;
      add = Number(base) / 10 ** dec;
    }
    volTotalMap.set(cid, (volTotalMap.get(cid) ?? 0) + add);
    if (in24) vol24hMap.set(cid, (vol24hMap.get(cid) ?? 0) + add);
  }

  // 3) 24h CHANGE: compare last 24h vs previous 24h (24–48h ago), selected currency
  const since48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const sales48h = await prisma.marketplaceSale.findMany({
    where: {
      timestamp: { gte: since48h, lte: now },
      nft: { collectionId: { in: collectionIds } },
      AND: [
        ...(currencyMeta.kind === "NATIVE"
          ? [
              {
                OR: [
                  { currencyId: null },
                  { currency: { kind: CurrencyKind.NATIVE } },
                ],
              },
            ]
          : [{ currencyId: currencyMeta.id! }]),
      ],
    },
    select: {
      priceEtnWei: true,
      priceTokenAmount: true,
      timestamp: true,
      currency: { select: { decimals: true, kind: true } },
      nft: { select: { collectionId: true } },
    },
    orderBy: { timestamp: "desc" },
    take: 5000,
  });

  const winMap = new Map<string, { curr: number; prev: number }>();
  for (const s of sales48h) {
    const cid = s.nft.collectionId!;
    const bucket = s.timestamp >= since24h ? "curr" : "prev";
    let amt = 0;
    if (currencyMeta.kind === "NATIVE") {
      const base = (s.priceEtnWei as any)?.toString?.();
      if (!base) continue;
      amt = Number(base) / 10 ** currencyMeta.decimals;
    } else {
      const base = (s.priceTokenAmount as any)?.toString?.();
      if (!base) continue;
      const dec = s.currency?.decimals ?? currencyMeta.decimals;
      amt = Number(base) / 10 ** dec;
    }
    const acc = winMap.get(cid) ?? { curr: 0, prev: 0 };
    acc[bucket] += amt;
    winMap.set(cid, acc);
  }

  // Attach metrics onto slice
  const enriched = slice.map((c) => {
    const floor = floorMap.get(c.id);
    const total = volTotalMap.get(c.id) ?? 0;
    const v24 = vol24hMap.get(c.id) ?? 0;
    const w = winMap.get(c.id) ?? { curr: 0, prev: 0 };

    return {
      ...c,
      // currency-aware metrics
      floor: floor ? floor.human : NA,
      floorBase: floor ? floor.base : null,
      volumeTotal: total,
      volume24h: v24,
      change24h: pctChange(w.curr, w.prev), // overwrite DB column with computed per-currency delta
      currency: currencyMeta,
    };
  });

  // Per-currency page-level sorting
  if (sort === "floor") {
    enriched.sort((a, b) => {
      const fa = a.floor ?? Number.POSITIVE_INFINITY;
      const fb = b.floor ?? Number.POSITIVE_INFINITY;
      return fa - fb; // lowest floor first
    });
  } else if (sort === "volume") {
    enriched.sort((a, b) => (b.volumeTotal ?? 0) - (a.volumeTotal ?? 0));
  }

  const resp = NextResponse.json(
    { items: enriched, nextCursor, currency: currencyMeta },
    { status: 200 }
  );
  resp.headers.set("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
  return resp;
}
