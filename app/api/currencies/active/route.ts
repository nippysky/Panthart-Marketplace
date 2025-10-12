// app/api/currencies/active/route.ts
import { NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

export async function GET() {
  await prismaReady;
  const items = await prisma.currency.findMany({
    where: { active: true },
    select: { id: true, symbol: true, decimals: true, kind: true, tokenAddress: true },
    orderBy: { symbol: "asc" },
  });
  return NextResponse.json({ items });
}
