// app/api/collections/[contract]/facets/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { NftStatus } from "@/lib/generated/prisma";

/**
 * Returns lightweight “facets” for a collection:
 *  - population (number of ranked tokens)
 *  - trait buckets: [{ type, values: [{ value, count }] }]
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ contract: string }> }
) {
  await prismaReady;
  const { contract: rawParam } = await context.params;

  try {
    // Resolve canonical contract (case-insensitive)
    const collection = await prisma.collection.findFirst({
      where: { contract: { equals: rawParam, mode: "insensitive" } },
      select: { contract: true },
    });
    if (!collection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const contract = collection.contract;

    // Population (ranked supply) — robust if rarity table is absent
    let population = 0;
    try {
      const popRows = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
        `
          SELECT COUNT(*)::bigint AS cnt
          FROM "NFTRarity" r
          WHERE lower(r.contract) = lower($1) AND r.rank IS NOT NULL
        `,
        contract
      );
      population = Number(popRows?.[0]?.cnt ?? 0);
    } catch {
      population = 0;
    }

    // Trait facets (works off JSONB attributes on NFT)
    // Case-insensitive contract check; coalesce attributes to [] to avoid errors.
    const traitRows = await prisma.$queryRawUnsafe<
      { type: string | null; value: string | null; count: bigint }[]
    >(
      `
        SELECT
          att->>'trait_type' AS type,
          att->>'value'      AS value,
          COUNT(*)::bigint   AS count
        FROM "NFT" n,
             jsonb_array_elements(COALESCE(n.attributes, '[]'::jsonb)) AS att
        WHERE lower(n.contract) = lower($1)
          AND n.status = '${NftStatus.SUCCESS}'
          AND att ? 'trait_type'
          AND att ? 'value'
        GROUP BY 1,2
        HAVING att->>'trait_type' IS NOT NULL AND att->>'value' IS NOT NULL
        ORDER BY 1 ASC, count DESC, 2 ASC
      `,
      contract
    );

    // Group into { type, values[] }
    const map = new Map<string, { type: string; values: { value: string; count: number }[] }>();
    for (const r of traitRows) {
      const type = (r.type || "").trim();
      const value = (r.value || "").trim();
      if (!type || !value) continue;
      if (!map.has(type)) map.set(type, { type, values: [] });
      map.get(type)!.values.push({ value, count: Number(r.count) });
    }

    const facets = Array.from(map.values());

    return NextResponse.json({ population, traits: facets });
  } catch (err) {
    console.error("[facets] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
