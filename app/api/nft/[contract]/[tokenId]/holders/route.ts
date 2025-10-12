// app/api/nft/[contract]/[tokenId]/holders/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { getAddress } from "ethers";

function toChecksum(addr: string): string {
  try {
    return getAddress(addr);
  } catch {
    // If somehow not a valid EVM address, keep original casing (do not lowercase)
    return addr;
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ contract: string; tokenId: string }> }
) {
  await prismaReady;
  const { contract, tokenId } = await ctx.params;

  try {
    const rows = await prisma.erc1155Holding.findMany({
      where: {
        contract: { equals: contract, mode: "insensitive" },
        tokenId,
        balance: { gt: 0 },
      },
      orderBy: [{ balance: "desc" }, { ownerAddress: "asc" }],
      select: { ownerAddress: true, balance: true },
    });

    const ownersList = rows.map((r) => r.ownerAddress);
    const users = ownersList.length
      ? await prisma.user.findMany({
          where: {
            walletAddress: {
              in: ownersList,
              mode: "insensitive",
            },
          },
          select: { walletAddress: true, username: true, profileAvatar: true },
        })
      : [];

    // Build a checksum-keyed map (no lowercasing anywhere)
    const profileMap = new Map(
      users.map((u) => [toChecksum(u.walletAddress), u])
    );

    const holders = rows.map((r) => {
      const u = profileMap.get(toChecksum(r.ownerAddress));
      return {
        ownerAddress: r.ownerAddress, // preserve original casing from DB
        balance: r.balance,
        profile: u
          ? { username: u.username, profileAvatar: u.profileAvatar ?? undefined }
          : undefined,
      };
    });

    const resp = NextResponse.json({ holders }, { status: 200 });
    resp.headers.set("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    return resp;
  } catch (e) {
    console.error("[api holders] error:", e);
    return NextResponse.json({ holders: [] }, { status: 200 });
  }
}
