// app/api/collections/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { Prisma, CurrencyKind } from "@/lib/generated/prisma";

/* --------------------------------- helpers --------------------------------- */
type SalePhase = "presale" | "public" | null;

function toNumber(x: any): number { if (x == null) return 0; try { return Number((x as any).toString()); } catch { return Number(x) || 0; } }
function weiToEtn(wei?: any): number { return toNumber(wei) / 1e18; }
function pctChange(curr: number, prev: number): number { if (prev <= 0) return curr > 0 ? 100 : 0; return ((curr - prev) / prev) * 100; }

/** Anchor to the **start of the UTC hour** so this route matches Top Collections exactly. */
function floorToHourUTC(d: Date): Date {
  const t = d.getTime();
  const hr = Math.floor(t / 3_600_000) * 3_600_000;
  return new Date(hr);
}

/** Windows (Explore only exposes 24h/7d/30d, but we keep others for compatibility) */
const WINDOW_MS: Record<string, number | "all"> = {
  "24h": 24 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "6m": 180 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
  all: "all",
};

/* -------- owners / items (fast batched helpers) -------- */

async function fetchLiveItemCounts(contracts: string[]) {
  if (contracts.length === 0) return new Map<string, number>();
  const rows = await prisma.$queryRaw<Array<{ contract: string; cnt: bigint }>>(Prisma.sql`
    SELECT "contract", COUNT(*)::bigint AS cnt
    FROM "NFT"
    WHERE "status" = 'SUCCESS'::"NftStatus"
      AND "contract" IN (${Prisma.join(contracts)})
    GROUP BY "contract"
  `);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.contract, Number(r.cnt));
  return map;
}
async function fetchOwnersERC721(contracts: string[]) {
  if (contracts.length === 0) return new Map<string, number>();
  const rows = await prisma.$queryRaw<Array<{ contract: string; owners: number }>>(Prisma.sql`
    SELECT "contract", COUNT(DISTINCT "ownerId")::int AS owners
    FROM "NFT"
    WHERE "status" = 'SUCCESS'::"NftStatus"
      AND "ownerId" IS NOT NULL
      AND "contract" IN (${Prisma.join(contracts)})
    GROUP BY "contract"
  `);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.contract, r.owners);
  return map;
}
async function fetchOwnersERC1155(contracts: string[]) {
  if (contracts.length === 0) return new Map<string, number>();
  const rows = await prisma.$queryRaw<Array<{ contract: string; owners: number }>>(Prisma.sql`
    SELECT "contract", COUNT(DISTINCT "ownerAddress")::int AS owners
    FROM "Erc1155Holding"
    WHERE "balance" > 0
      AND "contract" IN (${Prisma.join(contracts)})
    GROUP BY "contract"
  `);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.contract, r.owners);
  return map;
}

/* ------------------------- currency-aware helpers ------------------------- */

async function resolveCurrencyMeta(currencyQ: string | null) {
  if (!currencyQ || currencyQ.trim().toLowerCase() === "native") {
    return { id: undefined as string | undefined, symbol: "ETN", decimals: 18, kind: "NATIVE" as const };
  }
  const cur = await prisma.currency.findFirst({ where: { id: currencyQ, active: true }, select: { id: true, symbol: true, decimals: true, kind: true } });
  if (!cur) throw new Error("Unknown currency");
  return { id: cur.id, symbol: cur.symbol, decimals: cur.decimals ?? 18, kind: cur.kind === CurrencyKind.ERC20 ? ("ERC20" as const) : ("NATIVE" as const) };
}

/** FLOOR per currency (omit when none; UI shows “–”). */
async function fetchMinFloorsCurrency(collectionIds: string[], currencyMeta: { id?: string; kind: "NATIVE" | "ERC20"; decimals: number }) {
  if (collectionIds.length === 0) return new Map<string, number | null>();
  const now = new Date();
  const listings = await prisma.marketplaceListing.findMany({
    where: {
      status: "ACTIVE",
      startTime: { lte: now },
      AND: [
        { OR: [{ endTime: null }, { endTime: { gt: now } }] },
        ...(currencyMeta.kind === "NATIVE"
          ? [{ OR: [{ currencyId: null }, { currency: { kind: CurrencyKind.NATIVE } }] }]
          : [{ currencyId: currencyMeta.id! }]),
      ],
      nft: { collectionId: { in: collectionIds } },
    },
    select: { priceEtnWei: true, priceTokenAmount: true, currency: { select: { decimals: true } }, nft: { select: { collectionId: true } } },
    orderBy: [{ priceEtnWei: "asc" }, { priceTokenAmount: "asc" }],
    take: 10000,
  });

  const map = new Map<string, number | null>();
  for (const rec of listings) {
    const cid = rec.nft.collectionId!;
    let human: number | null = null;
    if (currencyMeta.kind === "NATIVE") {
      const base = (rec.priceEtnWei as any)?.toString?.(); if (!base) continue;
      human = Number(base) / 1e18;
    } else {
      const base = (rec.priceTokenAmount as any)?.toString?.(); if (!base) continue;
      const dec = rec.currency?.decimals ?? currencyMeta.decimals;
      human = Number(base) / 10 ** dec;
    }
    const prev = map.get(cid);
    if (prev == null || (human != null && human < prev)) map.set(cid, human);
  }
  return map;
}

/** WINDOW volumes (current/previous) — anchored to UTC hour. */
async function fetchWindowVolumesCurrency(
  collectionIds: string[],
  windowMs: number | "all",
  currencyMeta: { id?: string; kind: "NATIVE" | "ERC20"; decimals: number }
) {
  const curMap = new Map<string, number>();
  const prevMap = new Map<string, number>();
  if (collectionIds.length === 0) return { curMap, prevMap };
  if (windowMs === "all") return { curMap, prevMap };

  const now = floorToHourUTC(new Date());
  const startCurr = new Date(now.getTime() - (windowMs as number));
  const startPrev = new Date(startCurr.getTime() - (windowMs as number));

  const whereCurr = currencyMeta.kind === "NATIVE"
    ? { timestamp: { gte: startCurr }, nft: { collectionId: { in: collectionIds } } }
    : { timestamp: { gte: startCurr }, nft: { collectionId: { in: collectionIds } }, currencyId: currencyMeta.id! };

  const wherePrev = currencyMeta.kind === "NATIVE"
    ? { timestamp: { gte: startPrev, lt: startCurr }, nft: { collectionId: { in: collectionIds } } }
    : { timestamp: { gte: startPrev, lt: startCurr }, nft: { collectionId: { in: collectionIds } }, currencyId: currencyMeta.id! };

  const curr = await prisma.marketplaceSale.findMany({
    where: whereCurr,
    select: { priceEtnWei: true, priceTokenAmount: true, currency: { select: { decimals: true } }, nft: { select: { collectionId: true } } },
    orderBy: { timestamp: "desc" },
    take: 50000,
  });
  const prev = await prisma.marketplaceSale.findMany({
    where: wherePrev,
    select: { priceEtnWei: true, priceTokenAmount: true, currency: { select: { decimals: true } }, nft: { select: { collectionId: true } } },
    orderBy: { timestamp: "desc" },
    take: 50000,
  });

  const add = (rows: typeof curr, target: Map<string, number>) => {
    for (const r of rows) {
      const cid = r.nft.collectionId!; if (!cid) continue;
      if (currencyMeta.kind === "NATIVE") {
        const base = (r.priceEtnWei as any)?.toString?.(); if (!base) continue;
        target.set(cid, (target.get(cid) ?? 0) + Number(base) / 1e18);
      } else {
        const base = (r.priceTokenAmount as any)?.toString?.(); if (!base) continue;
        const dec = r.currency?.decimals ?? currencyMeta.decimals;
        target.set(cid, (target.get(cid) ?? 0) + Number(base) / 10 ** dec);
      }
    }
  };
  add(curr, curMap);
  add(prev, prevMap);
  return { curMap, prevMap };
}

/* ---------------------------------- route ---------------------------------- */

export async function GET(req: NextRequest) {
  await prismaReady;

  try {
    const url = new URL(req.url);

    // paging
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "24", 10), 100);
    const cursor = url.searchParams.get("cursor") || undefined;

    // filters
    const search = url.searchParams.get("search")?.trim() || undefined;
    const minFloor = Number(url.searchParams.get("minFloor") || "0");
    const minVolume = Number(url.searchParams.get("minVolume") || "0");
    const minSupply = Number(url.searchParams.get("minSupply") || url.searchParams.get("minItems") || "0");

    // currency
    const currencyQ = url.searchParams.get("currency") || "native";
    const currencyMeta = await resolveCurrencyMeta(currencyQ);

    // sort
    const sortByParam =
      (url.searchParams.get("sortBy") as
        | "volumeDesc" | "volumeAsc" | "floorDesc" | "floorAsc"
        | "itemsDesc" | "itemsAsc" | "supplyDesc" | "supplyAsc"
        | undefined) ?? "volumeDesc";

    const sortBy =
      sortByParam === "supplyAsc" ? "itemsAsc" :
      sortByParam === "supplyDesc" ? "itemsDesc" :
      sortByParam;

    // window
    const windowParam = (url.searchParams.get("window") || "24h").toLowerCase();
    const windowMs = WINDOW_MS[windowParam] ?? WINDOW_MS["24h"];
    const isAllTime = windowMs === "all";
    const windowLabel = isAllTime ? "ALL" : windowParam.toUpperCase();

    // only started
    const onlyStarted = url.searchParams.get("onlyStarted") === "1";
    const isVisibleByStart = (c: any, now: Date) => {
      if (!onlyStarted) return true;
      const hasAnySchedule = !!c.presale || !!c.publicSale;
      if (!hasAnySchedule) return true;
      const ps = c.presale?.startTime ? new Date(c.presale.startTime).getTime() : Number.POSITIVE_INFINITY;
      const pub = c.publicSale?.startTime ? new Date(c.publicSale.startTime).getTime() : Number.POSITIVE_INFINITY;
      const earliest = Math.min(ps, pub);
      if (!isFinite(earliest)) return true;
      return new Date().getTime() >= earliest;
    };

    /* ---------------- WHERE ---------------- */
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { symbol: { contains: search, mode: "insensitive" } },
        { contract: { contains: search, mode: "insensitive" } },
      ];
    }
    if (minFloor > 0) where.floorPrice = { gte: minFloor };
    if (minVolume > 0) where.volume = { gte: minVolume };
    if (minSupply > 0) where.itemsCount = { gte: minSupply };

    /* --------------- ORDER BY -------------- */
    const orderBy: any[] = [];
    switch (sortBy) {
      case "volumeAsc": orderBy.push({ volume: "asc" }); break;
      case "floorDesc": orderBy.push({ floorPrice: "desc" }); break;
      case "floorAsc":  orderBy.push({ floorPrice: "asc" }); break;
      case "itemsDesc": orderBy.push({ itemsCount: "desc" }); break;
      case "itemsAsc":  orderBy.push({ itemsCount: "asc" }); break;
      case "volumeDesc":
      default: orderBy.push({ volume: "desc" }); break;
    }
    orderBy.push({ id: "asc" });

    /* --------------- PAGE FETCH ------------- */
    const raw = await prisma.collection.findMany({
      where,
      orderBy,
      select: {
        id: true, name: true, symbol: true, contract: true, logoUrl: true, coverUrl: true,
        volume: true, floorPrice: true, itemsCount: true, ownersCount: true,
        indexStatus: true, standard: true, supply: true,
        presale: { select: { startTime: true, endTime: true } },
        publicSale: { select: { startTime: true } },
        createdAt: true,
      },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const now = new Date();
    const rawFiltered = raw.filter((c) => isVisibleByStart(c, now));
    const nextCursor = rawFiltered.length === limit ? rawFiltered[rawFiltered.length - 1].id : null;

    // ---------------- SEARCH FAST PATH (snapshots) ----------------
    if (search) {
      const collections = rawFiltered.map((c) => {
        const presaleActive = !!c.presale && now >= c.presale.startTime && now <= c.presale.endTime;
        const publicActive  = !!c.publicSale && now >= c.publicSale.startTime;
        let sale: { isActive: boolean; activePhase: SalePhase } =
          presaleActive ? { isActive: true, activePhase: "presale" } :
          publicActive  ? { isActive: true, activePhase: "public" } :
                          { isActive: false, activePhase: null };

        const itemsLive = c.itemsCount ?? 0;
        const supply = c.supply ?? 0;
        const soldOut = supply > 0 && itemsLive >= supply;
        if (soldOut) sale = { isActive: false, activePhase: null };

        const isFullyIndexed = (c.supply != null && itemsLive >= (c.supply ?? 0)) || String(c.indexStatus ?? "").toLowerCase() === "completed";

        return {
          id: c.id, name: c.name, contract: c.contract, logoUrl: c.logoUrl, coverUrl: c.coverUrl,
          volume: c.volume ?? 0,
          floorPrice: c.floorPrice && c.floorPrice > 0 ? c.floorPrice : null,
          items: itemsLive, owners: c.ownersCount ?? 0,
          isFullyIndexed, sale,
          windowVolume: isAllTime ? (currencyMeta.kind === "NATIVE" ? c.volume ?? 0 : 0) : 0,
          windowChange: isAllTime ? null : 0,
          windowLabel, standard: c.standard ?? null, supply: c.supply ?? null,
          currency: { id: currencyMeta.id, symbol: currencyMeta.symbol, decimals: currencyMeta.decimals, kind: currencyMeta.kind },
        };
      });

      const resp = NextResponse.json({ collections, nextCursor, currency: currencyMeta });
      resp.headers.set("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
      return resp;
    }

    /* -------- Heavy metrics for non-search path (currency-aware) -------- */
    const contracts = rawFiltered.map((c) => c.contract);
    const [itemsMap, owners721, owners1155] = await Promise.all([
      fetchLiveItemCounts(contracts),
      fetchOwnersERC721(rawFiltered.filter((c) => (c.standard || "").toUpperCase() !== "ERC1155").map((c) => c.contract)),
      fetchOwnersERC1155(rawFiltered.filter((c) => (c.standard || "").toUpperCase() === "ERC1155").map((c) => c.contract)),
    ]);

    const collectionIds = rawFiltered.map((c) => c.id);
    const [floorMap, { curMap: volWindowMap, prevMap: prevWindowMap }] = await Promise.all([
      fetchMinFloorsCurrency(collectionIds, currencyMeta),
      fetchWindowVolumesCurrency(collectionIds, windowMs, currencyMeta),
    ]);

    const collections = rawFiltered.map((c) => {
      const cid = c.id, key = c.contract;
      const itemsLive = itemsMap.get(key) ?? c.itemsCount ?? 0;

      const floorLiveRaw = floorMap.get(cid) ?? (currencyMeta.kind === "NATIVE" ? (c.floorPrice ?? null) : null);
      const floorLive = floorLiveRaw && floorLiveRaw > 0 ? floorLiveRaw : null;

      const owners = c.ownersCount && c.ownersCount > 0
        ? c.ownersCount
        : (c.standard || "").toUpperCase() === "ERC1155" ? (owners1155.get(key) ?? 0) : (owners721.get(key) ?? 0);

      const presaleActive = !!c.presale && now >= c.presale.startTime && now <= c.presale.endTime;
      const publicActive  = !!c.publicSale && now >= c.publicSale.startTime;
      let sale: { isActive: boolean; activePhase: SalePhase } =
        presaleActive ? { isActive: true, activePhase: "presale" } :
        publicActive  ? { isActive: true, activePhase: "public" } :
                        { isActive: false, activePhase: null };

      const supply = c.supply ?? 0;
      const soldOut = supply > 0 && itemsLive >= supply;
      if (soldOut) sale = { isActive: false, activePhase: null };

      const isFullyIndexed = (c.supply != null && itemsLive >= (c.supply ?? 0)) || String(c.indexStatus ?? "").toLowerCase() === "completed";

      let windowVolume = 0; let windowChange: number | null = null;
      if (isAllTime) {
        windowVolume = currencyMeta.kind === "NATIVE" ? c.volume ?? 0 : 0;
        windowChange = null;
      } else {
        const currV = volWindowMap.get(cid) ?? 0;
        const prevV = prevWindowMap.get(cid) ?? 0;
        windowVolume = currV;
        windowChange = pctChange(currV, prevV);
      }

      return {
        id: c.id, name: c.name, contract: c.contract, logoUrl: c.logoUrl, coverUrl: c.coverUrl,
        volume: c.volume ?? 0, floorPrice: floorLive, items: itemsLive, owners,
        isFullyIndexed, sale, windowVolume, windowChange, windowLabel,
        standard: c.standard ?? null, supply: c.supply ?? null,
        currency: { id: currencyMeta.id, symbol: currencyMeta.symbol, decimals: currencyMeta.decimals, kind: currencyMeta.kind },
      };
    });

    const resp = NextResponse.json({ collections, nextCursor, currency: currencyMeta });
    resp.headers.set("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
    return resp;
  } catch (err) {
    console.error("GET /api/collections error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
