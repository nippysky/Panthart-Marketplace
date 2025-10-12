// app/api/minting-now/erc1155/[contract]/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

type PageParams = { params: Promise<{ contract: string }> };

export async function GET(_: NextRequest, ctx: PageParams) {
  const { contract } = await ctx.params;
  await prismaReady;
  try {
    const s = await prisma.single1155.findFirst({
      where: { contract: { equals: contract, mode: "insensitive" } },
      include: { balances: { select: { balance: true } } },
    });
    if (!s) {
      return NextResponse.json({ error: "not-found" }, { status: 404 });
    }

    const supply = Number(s.maxSupply ?? 0);
    const mintedDb = (s.balances || []).reduce((acc, b) => acc + (b.balance ?? 0), 0);
    const mintedPct = supply > 0 ? Math.min(100, Math.round((mintedDb / supply) * 100)) : 0;

    return NextResponse.json({
      contract: s.contract,
      name: s.name,
      description: s.description,
      imageUrl: s.imageUrl,
      supply,
      minted: mintedDb,
      mintedPct,
      priceEtnWei: s.mintPriceEtnWei?.toString?.() ?? "0",
      maxPerWallet: Number(s.maxPerWallet ?? 0),
      creator: { walletAddress: s.ownerAddress },
    });
  } catch (e) {
    console.error("[GET /api/minting-now/erc1155/[contract]]", e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}
