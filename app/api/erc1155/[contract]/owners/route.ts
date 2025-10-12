// app/api/collections/[contract]/owners-1155/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";


export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ contract: string }> }
) {
  await prismaReady;

  const { contract: rawContract } = await ctx.params; // keep user casing
  if (!rawContract || typeof rawContract !== "string") {
    return NextResponse.json({ error: "Missing contract" }, { status: 400 });
  }

  // 1) Find the Single1155 row by contract (case-insensitive)
  const single = await prisma.single1155.findFirst({
    where: { contract: { equals: rawContract, mode: "insensitive" } },
    select: { id: true },
  });

  if (!single) {
    // Soft-404: return empty owners so UI can handle gracefully
    return NextResponse.json({ owners: [], count: 0 });
  }

  // 2) Top holders for this drop (balance > 0)
  const owners = await prisma.erc1155Balance.findMany({
    where: { single1155Id: single.id, balance: { gt: 0 } },
    select: { ownerAddress: true, balance: true },
    orderBy: [
      { balance: "desc" },      // primary sort
      { ownerAddress: "asc" },  // stable tiebreaker
    ],
    take: 5000, // keep your existing cap
  });

  return NextResponse.json({ count: owners.length, owners });
}
