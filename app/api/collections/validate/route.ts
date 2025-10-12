// app/api/collections/validate/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

export async function GET(req: NextRequest) {
  await prismaReady;
  const url = new URL(req.url);
  const contract = (url.searchParams.get("contract") || "").trim();
  const wallet = (url.searchParams.get("wallet") || "").trim().toLowerCase();

  if (!contract) {
    return NextResponse.json({ ok: false, reason: "Missing contract." });
  }

  const col = (await prisma.collection.findFirst({
    where: { contract: { equals: contract, mode: "insensitive" } },
  } as any)) as any;

  if (!col) return NextResponse.json({ ok: false, reason: "Collection not found in Panthart." });

  const items = Number(col.itemsCount ?? 0);
  if (items < 5) {
    return NextResponse.json({ ok: false, reason: "Collection must have at least 5 indexed items." });
  }

  // Try to determine owner from any of the common fields
  const owner: string | null =
    (col.ownerAddress as string) ||
    (col.creator as string) ||
    (col.owner?.walletAddress as string) ||
    (col.owner as string) ||
    null;

  if (!owner) {
    return NextResponse.json({
      ok: false,
      reason: "Could not verify contract owner in database. Please contact support.",
    });
  }

  if (wallet && owner.toLowerCase() !== wallet) {
    return NextResponse.json({
      ok: false,
      reason: "Only the collection owner can submit a bid for featuring.",
    });
  }

  return NextResponse.json({
    ok: true,
    collection: {
      contract: col.contract,
      name: col.name ?? null,
      logoUrl: col.logoUrl ?? null,
      itemsCount: items,
    },
  });
}
