export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * Robust “Top Collections” endpoint with:
 *  - Time windows: 24h, 7d, 30d
 *  - Per-currency floor + volumes (NATIVE ETN or specific ERC20 currency by id)
 *  - Ranking by selected-window volume (fallback: all-time volume)
 *  - Sale state (presale/public) and sold-out awareness
 */

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma";
import { CurrencyKind } from "@/lib/generated/prisma";
import { ethers } from "ethers";
import { memoizeAsync, cacheKey } from "@/lib/server/chain-cache";
import { ERC721_DROP_ABI } from "@/lib/abis/ERC721DropABI";

/* ----------------------------- Small helpers ----------------------------- */

type WindowKey = "24h" | "7d" | "30d";
const WINDOW_DEFAULT: WindowKey = "24h";

function parseWindow(v: string | null): WindowKey {
  if (v === "24h" || v === "7d" || v === "30d") return v;
  return WINDOW_DEFAULT;
}

function windowToMs(windowKey: WindowKey): number {
  switch (windowKey) {
    case "24h": return 24 * 60 * 60 * 1000;
    case "7d":  return 7 * 24 * 60 * 60 * 1000;
    case "30d": return 30 * 24 * 60 * 60 * 1000;
    default:    return 24 * 60 * 60 * 1000;
  }
}

function weiToHuman(baseStr: string, decimals = 18) {
  const n = Number(baseStr);
  return n / 10 ** decimals;
}

function pctChange(curr: number, prev: number): number {
  if (prev <= 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

/** Ethers v6 provider */
function getProvider(): ethers.AbstractProvider | null {
  const url = process.env.RPC_URL;
  try {
    return url ? new ethers.JsonRpcProvider(url) : null;
  } catch {
    return null;
  }
}

/** Cached chain totalSupply() (ttlMs ~ 12s). */
async function getMintedOnChainCached(
  provider: ethers.AbstractProvider | null,
  contract: string,
  ttlMs = 12_000
): Promise<number | null> {
  if (!provider) return null;
  const key = cacheKey(["minted721", contract.toLowerCase()]);
  return memoizeAsync<number | null>(key, ttlMs, async () => {
    try {
      const c = new ethers.Contract(contract, ERC721_DROP_ABI, provider);
      const ts: bigint = await c.totalSupply();
      return Number(ts);
    } catch {
      return null;
    }
  });
}

/** Only show collections that have started (presale OR public) OR have no sale schedule (legacy). */
type HasSaleFields = {
  presale: { startTime: Date; endTime: Date } | null;
  publicSale: { startTime: Date } | null;
};
function hasStarted(c: HasSaleFields, now: Date): boolean {
  const hasPresale = !!c.presale;
  const hasPublic = !!c.publicSale;
  if (!hasPresale && !hasPublic) return true; // no schedule → always eligible
  const presaleStarted = hasPresale ? now >= c.presale!.startTime : false;
  const publicStarted = hasPublic ? now >= c.publicSale!.startTime : false;
  return presaleStarted || publicStarted;
}

/** Prisma-select for collection base fields used here */
const selectCollection = {
  id: true,
  name: true,
  contract: true,
  logoUrl: true,
  coverUrl: true,
  floorPrice: true,  // DB ETN floor (fallback only for NATIVE)
  volume: true,      // DB all-time ETN volume (coarse fallback)
  itemsCount: true,  // DB minted fallback
  supply: true,
  indexStatus: true,
  presale: { select: { startTime: true, endTime: true } },
  publicSale: { select: { startTime: true } },
} satisfies Prisma.CollectionSelect;

type CollectionRow = Prisma.CollectionGetPayload<{ select: typeof selectCollection }>;

/* --------------------------------- GET --------------------------------- */

export async function GET(req: NextRequest) {
  await prismaReady;

  try {
    const provider = getProvider();

    const url = new URL(req.url);
    const windowKey = parseWindow(url.searchParams.get("window"));
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 10, 20));
    const currencyQ = (url.searchParams.get("currency") || "native").trim(); // 'native' | <currencyId>

    const now = new Date();

    // Resolve time windows
    const ms = windowToMs(windowKey);
    const startA = new Date(now.getTime() - ms);          // current window start
    const startB = new Date(now.getTime() - ms * 2);      // previous window start

    // Resolve currency
    const currencyMeta =
      currencyQ === "native"
        ? { id: "native", symbol: "ETN", decimals: 18, kind: "NATIVE" as const }
        : (() => {
            return prisma.currency.findFirst({
              where: { id: currencyQ, active: true },
              select: { id: true, symbol: true, decimals: true, kind: true },
            });
          })();

    const curMeta =
      "then" in (currencyMeta as any)
        ? (await currencyMeta) && {
            id: (await currencyMeta)!.id,
            symbol: (await currencyMeta)!.symbol,
            decimals: (await currencyMeta)!.decimals ?? 18,
            kind: (await currencyMeta)!.kind === CurrencyKind.ERC20 ? ("ERC20" as const) : ("NATIVE" as const),
          }
        : (currencyMeta as { symbol: string; decimals: number; kind: "NATIVE" });

    if (!curMeta) {
      return NextResponse.json({ error: "Unknown currency" }, { status: 400 });
    }

    /* ---------------------------------------
     * STEP 1: Gather sales for current & prev window (per currency)
     * Currency rules aligned with Explore:
     *  - Native: currencyId IS NULL OR currency.kind = NATIVE
     *  - ERC-20: currencyId = <id>
     * --------------------------------------- */
    type SaleRow = {
      priceEtnWei: Prisma.Decimal;
      priceTokenAmount: Prisma.Decimal | null;
      timestamp: Date;
      currency: { decimals: number | null } | null;
      nft: { collectionId: string | null };
    };

    const whereCurrencyNative: Prisma.MarketplaceSaleWhereInput = {
      OR: [{ currencyId: null }, { currency: { kind: CurrencyKind.NATIVE } }],
    };

    const fetchSalesWindow = async (from: Date, to?: Date): Promise<SaleRow[]> => {
      const base: Prisma.MarketplaceSaleWhereInput = {
        timestamp: { gte: from, ...(to ? { lt: to } : {}) },
        ...(curMeta.kind === "NATIVE" ? whereCurrencyNative : { currencyId: (curMeta as any).id }),
      };
      return prisma.marketplaceSale.findMany({
        where: base,
        select: {
          priceEtnWei: true,
          priceTokenAmount: true,
          timestamp: true,
          currency: { select: { decimals: true } },
          nft: { select: { collectionId: true } },
        },
        orderBy: { timestamp: "desc" },
        take: 200_000,
      });
    };

    const currentSales = await fetchSalesWindow(startA);
    const previousSales = await fetchSalesWindow(startB, startA);

    const sumByCollection = (rows: SaleRow[]) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const cid = r.nft.collectionId;
        if (!cid) continue;
        if (curMeta.kind === "NATIVE") {
          const base = (r.priceEtnWei as any)?.toString?.();
          if (!base) continue;
          const add = weiToHuman(base, 18);
          m.set(cid, (m.get(cid) ?? 0) + add);
        } else {
          const base = (r.priceTokenAmount as any)?.toString?.();
          if (!base) continue;
          const dec = r.currency?.decimals ?? curMeta.decimals;
          const add = weiToHuman(base, dec);
          m.set(cid, (m.get(cid) ?? 0) + add);
        }
      }
      return m;
    };

    const currMap = sumByCollection(currentSales);
    const prevMap = sumByCollection(previousSales);

    // Rank by current-window volume
    const rankedCollectionIds = [...currMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([cid]) => cid);

    /* ---------------------------------------
     * STEP 2: Materialize top N (eligible) + fill if needed by all-time
     * IMPORTANT FIX: compute floors **after** we know the complete candidate list
     * so fillers also receive floors.
     * --------------------------------------- */
    const baseRanked = await prisma.collection.findMany({
      where: { id: { in: rankedCollectionIds } },
      select: selectCollection,
    });
    const eligibleRanked = baseRanked.filter((c) => hasStarted(c, now));

    let candidates: CollectionRow[] = eligibleRanked;

    if (candidates.length < limit) {
      const need = limit - candidates.length;
      const filler = await prisma.collection.findMany({
        where: {
          id: { notIn: candidates.map((x) => x.id) },
          OR: [
            { presale: { is: { startTime: { lte: now } } } },
            { publicSale: { is: { startTime: { lte: now } } } },
            { AND: [{ presale: { is: null } }, { publicSale: { is: null } }] },
          ],
        },
        orderBy: { volume: "desc" },
        take: need,
        select: selectCollection,
      });
      const fillerEligible = filler.filter((c) => hasStarted(c, now));
      candidates = [...candidates, ...fillerEligible].slice(0, limit);
    }

    // ---- FLOORS for *all* candidates (currency-gated, time-gated)
    const candidateIds = candidates.map((c) => c.id);

    type ListingRow = {
      priceEtnWei: Prisma.Decimal;
      priceTokenAmount: Prisma.Decimal | null;
      currency: { decimals: number | null; kind: CurrencyKind; symbol: string } | null;
      nft: { collectionId: string | null };
      endTime: Date | null;
    };

    const listingRows = await prisma.marketplaceListing.findMany({
      where: {
        status: "ACTIVE",
        startTime: { lte: now },
        nft: { collectionId: { in: candidateIds } },
        AND: [
          { OR: [{ endTime: null }, { endTime: { gt: now } }] },
          ...(curMeta.kind === "NATIVE"
            ? [{ OR: [{ currencyId: null }, { currency: { kind: CurrencyKind.NATIVE } }] }]
            : [{ currencyId: (curMeta as any).id }]),
        ],
      },
      select: {
        priceEtnWei: true,
        priceTokenAmount: true,
        currency: { select: { decimals: true, kind: true, symbol: true } },
        nft: { select: { collectionId: true } },
        endTime: true,
      },
      orderBy: [{ priceEtnWei: "asc" }, { priceTokenAmount: "asc" }],
      take: 20_000,
    });

    const floorMap = new Map<string, { base: string; human: number }>();
    for (const r of listingRows) {
      const cid = r.nft.collectionId!;
      let baseStr: string | null = null;
      let human = 0;

      if (curMeta.kind === "NATIVE") {
        baseStr = (r.priceEtnWei as any)?.toString?.() ?? null;
        if (!baseStr) continue;
        human = weiToHuman(baseStr, 18);
      } else {
        baseStr = (r.priceTokenAmount as any)?.toString?.() ?? null;
        if (!baseStr) continue;
        const dec = r.currency?.decimals ?? curMeta.decimals;
        human = weiToHuman(baseStr, dec);
      }
      const prev = floorMap.get(cid);
      if (!prev || human < prev.human) {
        floorMap.set(cid, { base: baseStr, human });
      }
    }

    // All-time per selected currency (for display only)
    const allTimeSales = await prisma.marketplaceSale.findMany({
      where:
        curMeta.kind === "NATIVE"
          ? whereCurrencyNative
          : { currencyId: (curMeta as any).id },
      select: {
        priceEtnWei: true,
        priceTokenAmount: true,
        currency: { select: { decimals: true } },
        nft: { select: { collectionId: true } },
      },
      orderBy: { timestamp: "desc" },
      take: 300_000,
    });
    const allTimeMap = (() => {
      const m = new Map<string, number>();
      for (const r of allTimeSales as SaleRow[]) {
        const cid = r.nft.collectionId!;
        if (!cid) continue;
        if (curMeta.kind === "NATIVE") {
          const base = (r.priceEtnWei as any)?.toString?.();
          if (!base) continue;
          const add = weiToHuman(base, 18);
          m.set(cid, (m.get(cid) ?? 0) + add);
        } else {
          const base = (r.priceTokenAmount as any)?.toString?.();
          if (!base) continue;
          const dec = r.currency?.decimals ?? curMeta.decimals;
          const add = weiToHuman(base, dec);
          m.set(cid, (m.get(cid) ?? 0) + add);
        }
      }
      return m;
    })();

    // Shape
    const shaped = await Promise.all(
      candidates.map(async (c) => {
        const mintedOnChain = await getMintedOnChainCached(provider, c.contract);
        const minted = mintedOnChain ?? c.itemsCount ?? 0;
        const supply = Number.isFinite(c?.supply) && c?.supply != null ? Number(c.supply) : 0;
        const isSoldOut = supply > 0 && minted >= supply;

        const presaleActive =
          !!c.presale && now >= c.presale.startTime && now <= c.presale.endTime && !isSoldOut;
        const publicActive =
          !!c.publicSale && now >= c.publicSale.startTime && !isSoldOut;

        const sale = presaleActive
          ? { isActive: true, activePhase: "presale" as const }
          : publicActive
          ? { isActive: true, activePhase: "public" as const }
          : { isActive: false, activePhase: null };

        const floor = floorMap.get(c.id) || null;

        const volCurr = currMap.get(c.id) ?? 0;
        const volPrev = prevMap.get(c.id) ?? 0;
        const change = pctChange(volCurr, volPrev);
        const volAll = allTimeMap.get(c.id) ?? 0;

        // NORMALIZE: if snapshot floor is needed (only Native), use it, but convert 0 → null
        const snapshotFloor =
          curMeta.kind === "NATIVE" && (c.floorPrice ?? 0) > 0 ? c.floorPrice! : null;

        return {
          id: c.id,
          name: c.name,
          contract: c.contract,
          logoUrl: c.logoUrl,
          coverUrl: c.coverUrl,
          floor: floor ? floor.human : snapshotFloor,
          floorBase: floor ? floor.base : null,
          volumeWindow: volCurr,
          volumePrevWindow: volPrev,
          changePct: change,
          volumeAllTime: volAll,
          sale,
          isFullyIndexed: (supply > 0 && minted >= supply) || String(c.indexStatus) === "COMPLETED",
          isSoldOut,
          currency: curMeta,
        };
      })
    );

    // Final sort by current window volume (DESC) for defensive consistency
    shaped.sort((a, b) => b.volumeWindow - a.volumeWindow);

    const resp = NextResponse.json({ collections: shaped, nextCursor: null }, { status: 200 });
    resp.headers.set("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
    return resp;
  } catch (err) {
    console.error("[api/collections/top]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
