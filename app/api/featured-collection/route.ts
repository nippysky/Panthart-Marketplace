export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

/* ---------- types ---------- */
type TopItem = {
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
  rarityScore: number | null;
  volumeInCurrency?: number | null;
};
type CurrencyMeta = { id: string; symbol: string; decimals: number; kind: "NATIVE" | "ERC20" | string };

/* ---------- helpers ---------- */
function fromUnitsRaw(weiLike: any, decimals: number): number {
  if (weiLike == null) return 0;
  const s = typeof weiLike === "object" && "toString" in (weiLike as any) ? (weiLike as any).toString() : String(weiLike);
  try {
    const big = BigInt(s);
    const d = BigInt(10) ** BigInt(Math.max(0, decimals | 0));
    const whole = Number(big / d);
    const frac = Number(big % d) / Number(d);
    return whole + frac;
  } catch {
    const asNum = Number(s);
    return Number.isFinite(asNum) ? asNum / Math.pow(10, Math.max(0, decimals | 0)) : 0;
  }
}

export async function GET(req: NextRequest) {
  await prismaReady;

  const url = new URL(req.url);
  const by = (url.searchParams.get("by") || "rarity").toLowerCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 10), 1), 12);

  // contract resolution
  let contract = (url.searchParams.get("contract") || "").trim();
  if (!contract) {
    const latest = await prisma.featuredCycle.findFirst({
      where: { status: "FINALIZED" },
      orderBy: [{ endAt: "desc" }],
      select: { winnerCollectionContract: true },
    });
    const envFallback = process.env.PANTHART_NFC_CONTRACT || process.env.NEXT_PUBLIC_PANTHART_NFC_CONTRACT;
    contract = latest?.winnerCollectionContract || envFallback || "";
  }
  if (!contract) {
    return NextResponse.json({ ok: false, error: "No contract configured" }, { status: 200 });
  }

  // currency resolution
  const requestedCurrency = (url.searchParams.get("currency") || "native").toLowerCase();
  const active = (await prisma.currency.findMany({
    where: { active: true },
    select: { id: true, symbol: true, decimals: true, kind: true },
  })) as CurrencyMeta[];

  const fallback: CurrencyMeta[] = [{ id: "native", symbol: "ETN", decimals: 18, kind: "NATIVE" }];
  const currencies = active?.length ? active : fallback;

  const currency =
    currencies.find((c) => String(c.id).toLowerCase() === requestedCurrency) ||
    currencies.find((c) => String(c.kind).toUpperCase() === "NATIVE") ||
    fallback[0];

  const isNative = String(currency.kind).toUpperCase() === "NATIVE";

  // collection header
  const col = await prisma.collection.findFirst({
    where: { contract: { equals: contract, mode: "insensitive" } },
  } as any);
  if (!col) {
    return NextResponse.json({ ok: false, error: "Collection not found" }, { status: 200 });
  }

  /* ----- FLOOR (MarketplaceListing) ----- */
  let floorHuman = 0;
  try {
    if (isNative) {
      const listing = await prisma.marketplaceListing.findFirst({
        where: { status: "ACTIVE", nft: { contract: { equals: contract, mode: "insensitive" } } },
        orderBy: { priceEtnWei: "asc" },
        select: { priceEtnWei: true },
      } as any);
      floorHuman = listing?.priceEtnWei != null ? fromUnitsRaw(listing.priceEtnWei, 18) : Number(col.floorPrice ?? 0);
    } else {
      const listing = await prisma.marketplaceListing.findFirst({
        where: { status: "ACTIVE", currencyId: currency.id, nft: { contract: { equals: contract, mode: "insensitive" } } },
        orderBy: { priceTokenAmount: "asc" },
        select: { priceTokenAmount: true },
      } as any);
      floorHuman = listing?.priceTokenAmount != null ? fromUnitsRaw(listing.priceTokenAmount, currency.decimals) : 0;
    }
  } catch {
    floorHuman = isNative ? Number(col.floorPrice ?? 0) : 0;
  }

  /* ----- VOLUME (MarketplaceSale) ----- */
  let volumeHuman = 0;
  try {
    if (isNative) {
      const agg = await prisma.marketplaceSale.aggregate({
        where: { nft: { contract: { equals: contract, mode: "insensitive" } } },
        _sum: { priceEtnWei: true },
      } as any);
      volumeHuman = fromUnitsRaw(agg?._sum?.priceEtnWei ?? 0, 18);
    } else {
      const agg = await prisma.marketplaceSale.aggregate({
        where: { currencyId: currency.id, nft: { contract: { equals: contract, mode: "insensitive" } } },
        _sum: { priceTokenAmount: true },
      } as any);
      volumeHuman = fromUnitsRaw(agg?._sum?.priceTokenAmount ?? 0, currency.decimals);
    }
  } catch {
    volumeHuman = 0;
  }

  /* ----- Top items ----- */
  // internal shape (keep id so we can join volumes)
  type InternalItem = {
    id: string;
    tokenId: string;
    name: string | null;
    imageUrl: string | null;
    rarityScore: number | null;
  };
  const shapeInternal = (r: any): InternalItem => ({
    id: r.id,
    tokenId: r.tokenId,
    name: r.name ?? null,
    imageUrl: r.imageUrl ?? null,
    rarityScore: r.rarityScore != null ? Number(r.rarityScore) : null,
  });
  const toPublic = (r: InternalItem, vol?: number): TopItem => ({
    tokenId: r.tokenId,
    name: r.name,
    imageUrl: r.imageUrl,
    rarityScore: r.rarityScore,
    volumeInCurrency: vol ?? null,
  });

  let topItems: TopItem[] = [];

  if (by === "volume") {
    // group by NFT (sales)
    let groups: any[] = [];
    if (isNative) {
      groups = (await prisma.marketplaceSale.groupBy({
        by: ["nftId"],
        where: { nft: { contract: { equals: contract, mode: "insensitive" } } },
        _sum: { priceEtnWei: true },
        orderBy: { _sum: { priceEtnWei: "desc" } },
        take: limit,
      } as any)) as any[];
    } else {
      groups = (await prisma.marketplaceSale.groupBy({
        by: ["nftId"],
        where: { currencyId: currency.id, nft: { contract: { equals: contract, mode: "insensitive" } } },
        _sum: { priceTokenAmount: true },
        orderBy: { _sum: { priceTokenAmount: "desc" } },
        take: limit,
      } as any)) as any[];
    }

    const nftIds = groups.map((g) => g.nftId);
    if (nftIds.length) {
      const nfts = (await prisma.nFT.findMany({
        where: { id: { in: nftIds } },
        select: { id: true, tokenId: true, name: true, imageUrl: true, rarityScore: true, contract: true },
      } as any)) as any[];
      const byId = new Map(nfts.map((n) => [n.id, n])); // keep raw to check contract

      topItems = groups
        .map((g) => {
          const raw = byId.get(g.nftId);
          if (!raw || String(raw.contract).toLowerCase() !== contract.toLowerCase()) return null;
          const n = shapeInternal(raw);
          const sumVal = isNative ? g?._sum?.priceEtnWei ?? 0 : g?._sum?.priceTokenAmount ?? 0;
          const vol = fromUnitsRaw(sumVal, isNative ? 18 : currency.decimals);
          return toPublic(n, vol);
        })
        .filter(Boolean) as TopItem[];
    }
  } else {
    // RARITY branch — and we attach volumes too
    const rare = (await prisma.nFT.findMany({
      where: {
        contract: { equals: contract, mode: "insensitive" },
        status: "SUCCESS",
        imageUrl: { not: null },
        rarityScore: { not: null },
      },
      select: { id: true, tokenId: true, name: true, imageUrl: true, rarityScore: true },
      orderBy: { rarityScore: "desc" },
      take: limit,
    } as any)) as any[];

    const picked = rare.map(shapeInternal);

    // volumes for just these items
    const ids = picked.map((p) => p.id);
    const volMap = new Map<string, number>();
    if (ids.length) {
      if (isNative) {
        const grp = (await prisma.marketplaceSale.groupBy({
          by: ["nftId"],
          where: { nftId: { in: ids } },
          _sum: { priceEtnWei: true },
        } as any)) as any[];
        grp.forEach((g) => volMap.set(g.nftId, fromUnitsRaw(g?._sum?.priceEtnWei ?? 0, 18)));
      } else {
        const grp = (await prisma.marketplaceSale.groupBy({
          by: ["nftId"],
          where: { nftId: { in: ids }, currencyId: currency.id },
          _sum: { priceTokenAmount: true },
        } as any)) as any[];
        grp.forEach((g) => volMap.set(g.nftId, fromUnitsRaw(g?._sum?.priceTokenAmount ?? 0, currency.decimals)));
      }
    }

    topItems = picked.map((p) => toPublic(p, volMap.get(p.id) ?? 0));
  }

  return NextResponse.json(
    {
      ok: true,
      collection: {
        contract: col.contract,
        name: col.name,
        description: col.description,
        logoUrl: col.logoUrl,
        coverUrl: col.coverUrl,
        itemsCount: Number(col.itemsCount ?? 0),
        floorPrice: floorHuman,
        volume: volumeHuman,
        currencySymbol: currency.symbol,
        currencyId: currency.id,
      },
      topItems,
    },
    { status: 200 }
  );
}
