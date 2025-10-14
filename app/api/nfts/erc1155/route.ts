// app/api/nfts/erc1155/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { NftStatus, Prisma } from "@/lib/generated/prisma";

/**
 * Cursor pagination:
 *  - query: ?take=24&cursor=<createdAt_iso>_<id>
 *  - ordering: createdAt DESC, id DESC (stable)
 */
export async function GET(req: NextRequest) {
  await prismaReady;

  const url = new URL(req.url);
  const take = Math.min(60, Math.max(1, parseInt(url.searchParams.get("take") ?? "24", 10)));
  const cursor = url.searchParams.get("cursor");

  // parse cursor: createdAt|id
  let cursorClause: Prisma.NFTWhereUniqueInput | undefined;
  if (cursor) {
    const [createdAtISO, id] = cursor.split("|");
    const createdAt = new Date(createdAtISO);
    if (id && Number.isFinite(createdAt.valueOf())) {
      // We’ll use a composite emulation by moving the "after" window into a WHERE
      // and keeping orderBy stable (createdAt desc, id desc).
      // Strategy: fetch items strictly older OR same createdAt but lower id.
      // We'll build a where with OR conditions.
      const w1: Prisma.NFTWhereInput = { createdAt: { lt: createdAt } as any };
      const w2: Prisma.NFTWhereInput = { createdAt, id: { lt: id } as any };
      // We'll attach this post-hoc to main `where` using AND [{OR:[w1,w2]}]
      // stored below as extraWhere
      (globalThis as any).__erc1155_cursor_extraWhere = { OR: [w1, w2] } as Prisma.NFTWhereInput;
    }
  }

  const baseWhere: Prisma.NFTWhereInput = {
    standard: "ERC1155",
    status: { equals: NftStatus.SUCCESS },
    imageUrl: { not: null },
  };

  const extra = (globalThis as any).__erc1155_cursor_extraWhere as Prisma.NFTWhereInput | undefined;
  const where = extra ? { AND: [baseWhere, extra] } : baseWhere;

  try {
    const items = await prisma.nFT.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        contract: true,
        tokenId: true,
        name: true,
        imageUrl: true,
        createdAt: true,
        single1155: { select: { name: true, contract: true } },
        collection: { select: { name: true, contract: true } },
      },
    });

    // next cursor is the last item’s (createdAt|id)
    const next =
      items.length === take
        ? `${items[items.length - 1].createdAt.toISOString()}|${items[items.length - 1].id}`
        : null;

    return NextResponse.json({
      ok: true,
      items,
      nextCursor: next,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("[GET /api/nfts/erc1155] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  } finally {
    // cleanup ephemeral
    try { delete (globalThis as any).__erc1155_cursor_extraWhere; } catch {}
  }
}
