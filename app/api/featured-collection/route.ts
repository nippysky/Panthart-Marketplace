export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

type TopItem = {
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
  rarityScore: number | null;
  volumeEtn?: number | null;
};

function pickOwner(col: any): string | null {
  return (
    col?.ownerAddress ??
    col?.creator ??
    col?.owner?.walletAddress ??
    col?.owner ??
    null
  );
}

export async function GET(req: NextRequest) {
  await prismaReady;
  const url = new URL(req.url);
  let contract = (url.searchParams.get("contract") || "").trim();

  // ---- Choose contract when not explicitly provided ----
  if (!contract) {
    // Get the MOST RECENT finalized cycle (even if there was no winner)
    const latest = await prisma.featuredCycle.findFirst({
      where: { status: "FINALIZED" },
      orderBy: [{ endAt: "desc" }],
      select: { winnerCollectionContract: true },
    });

    // Prefer winner of the latest finalized cycle; otherwise use env fallback
    const envFallback =
      process.env.PANTHART_NFC_CONTRACT ||
      process.env.NEXT_PUBLIC_PANTHART_NFC_CONTRACT;

    contract = latest?.winnerCollectionContract || envFallback || "";
  }

  if (!contract) {
    return NextResponse.json(
      { ok: false, error: "No contract configured" },
      { status: 200 }
    );
  }

  const by = (url.searchParams.get("by") || "rarity").toLowerCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 10), 1), 12);

  // ---- Collection header ----
  const col = await prisma.collection.findFirst({
    where: { contract: { equals: contract, mode: "insensitive" } },
  } as any);

  if (!col) {
    return NextResponse.json(
      { ok: false, error: "Collection not found" },
      { status: 200 }
    );
  }

  const shape = (r: any): TopItem => ({
    tokenId: r.tokenId,
    name: r.name ?? null,
    imageUrl: r.imageUrl ?? null,
    rarityScore: r.rarityScore != null ? Number(r.rarityScore) : null,
  });

  let topItems: TopItem[] = [];

  if (by === "recent") {
    const rows = await prisma.nFT.findMany({
      where: {
        contract: { equals: contract, mode: "insensitive" },
        status: "SUCCESS",
        imageUrl: { not: null },
      },
      select: { tokenId: true, name: true, imageUrl: true, rarityScore: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
    } as any);
    topItems = rows.map(shape);
  } else if (by === "volume") {
    const groups = (await prisma.nFTActivity.groupBy({
      by: ["tokenId"],
      where: {
        contract: { equals: contract, mode: "insensitive" },
        priceEtnWei: { not: null },
      },
      _sum: { priceEtnWei: true },
      orderBy: { _sum: { priceEtnWei: "desc" } },
      take: limit,
    } as any)) as any[];

    const ids = groups.map((g) => g.tokenId);
    if (ids.length) {
      const nfts = (await prisma.nFT.findMany({
        where: {
          contract: { equals: contract, mode: "insensitive" },
          tokenId: { in: ids },
          status: "SUCCESS",
          imageUrl: { not: null },
        },
        select: { tokenId: true, name: true, imageUrl: true, rarityScore: true },
      } as any)) as any[];
      const byId = new Map(nfts.map((n) => [n.tokenId, n]));

      topItems = groups
        .map((g) => {
          const n = byId.get(g.tokenId);
          if (!n) return null;

          const sumWeiStr =
            g._sum?.priceEtnWei?.toString?.() ??
            (typeof g._sum?.priceEtnWei === "number" ? String(g._sum.priceEtnWei) : "0");

          let volumeEtn = 0;
          try {
            const asNum = Number(sumWeiStr);
            volumeEtn = Number.isFinite(asNum) ? asNum / 1e18 : 0;
          } catch {
            volumeEtn = 0;
          }

          return { ...shape(n), volumeEtn };
        })
        .filter(Boolean) as TopItem[];
    } else {
      topItems = [];
    }
  } else {
    // rarity first, then top up with recents
    const picked: TopItem[] = [];
    const seen = new Set<string>();

    const rare = (await prisma.nFT.findMany({
      where: {
        contract: { equals: contract, mode: "insensitive" },
        status: "SUCCESS",
        imageUrl: { not: null },
        rarityScore: { not: null },
      },
      select: { tokenId: true, name: true, imageUrl: true, rarityScore: true },
      orderBy: { rarityScore: "desc" },
      take: limit * 2,
    } as any)) as any[];

    for (const r of rare) {
      if (picked.length >= limit) break;
      if (seen.has(r.tokenId)) continue;
      picked.push(shape(r));
      seen.add(r.tokenId);
    }

    if (picked.length < limit) {
      const missing = limit - picked.length;
      const recent = (await prisma.nFT.findMany({
        where: {
          contract: { equals: contract, mode: "insensitive" },
          status: "SUCCESS",
          imageUrl: { not: null },
          tokenId: { notIn: Array.from(seen) },
        },
        select: { tokenId: true, name: true, imageUrl: true, rarityScore: true },
        orderBy: { updatedAt: "desc" },
        take: missing,
      } as any)) as any[];
      for (const r of recent) {
        if (picked.length >= limit) break;
        if (seen.has(r.tokenId)) continue;
        picked.push(shape(r));
        seen.add(r.tokenId);
      }
    }

    topItems = picked;
    /* end rarity branch */
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
        floorPrice: Number(col.floorPrice ?? 0),
        volume: Number(col.volume ?? 0),
        owner: pickOwner(col),
      },
      topItems,
    },
    { status: 200 }
  );
}
