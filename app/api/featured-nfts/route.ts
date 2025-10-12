// app/api/featured-nfts/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

/** Pick the first defined fallback contract from env */
function getFallbackContract(): string {
  return (
      process.env.PANTHART_NFC_CONTRACT ||
      process.env.NEXT_PUBLIC_PANTHART_NFC_CONTRACT ||
    ""
  );
}

/**
 * Returns a shuffled sample of NFTs (with images) for a featured collection.
 * Contract priority:
 *   1) ?contract=0x...
 *   2) latest FINALIZED cycle's winner (even if it's "no winner" → then fallback)
 *   3) env fallback (NEXT_PUBLIC_FEATURED_FALLBACK_CONTRACT / PANTHART_NFC_CONTRACT / etc.)
 */
export async function GET(req: NextRequest) {
  await prismaReady;

  const url = new URL(req.url);
  let contract = (url.searchParams.get("contract") || "").trim();

  if (!contract) {
    // Get the most recent FINALIZED cycle regardless of winner
    const latest = await prisma.featuredCycle.findFirst({
      where: { status: "FINALIZED" },
      orderBy: [{ endAt: "desc" }],
      select: { winnerCollectionContract: true },
    });

    if (latest?.winnerCollectionContract) {
      contract = latest.winnerCollectionContract;
    } else {
      // No winner in the latest cycle (or no cycles): hard fallback to env
      contract = getFallbackContract();
    }
  }

  if (!contract) {
    // Nothing configured — return empty set gracefully
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  const rows = await prisma.nFT.findMany({
    where: {
      contract: { equals: contract, mode: "insensitive" },
      status: "SUCCESS",
      imageUrl: { not: null },
    },
    select: {
      tokenId: true,
      name: true,
      description: true,
      imageUrl: true,
      contract: true,
      owner: {
        select: {
          walletAddress: true,
          username: true,
          profileAvatar: true,
          updatedAt: true,
        },
      },
      collection: {
        select: {
          creator: {
            select: {
              walletAddress: true,
              username: true,
              profileAvatar: true,
              updatedAt: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });

  const items = rows.map((r) => {
    const fallbackOwner =
      r.owner ??
      r.collection?.creator ?? {
        walletAddress: "0x0000000000000000000000000000000000000000",
        username: "Unknown",
        profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${r.contract}:${r.tokenId}`,
        updatedAt: new Date(0),
      };

    return {
      contract: r.contract,
      tokenId: r.tokenId,
      name: r.name ?? `Token ${r.tokenId}`,
      description: r.description ?? "",
      image: r.imageUrl!, // may be png/gif/mp4/webm
      owner: {
        walletAddress: fallbackOwner.walletAddress,
        username:
          fallbackOwner.username ??
          `${fallbackOwner.walletAddress.slice(0, 6)}…${fallbackOwner.walletAddress.slice(-4)}`,
        profileAvatar:
          fallbackOwner.profileAvatar ??
          `https://api.dicebear.com/7.x/identicon/svg?seed=${fallbackOwner.walletAddress}`,
        updatedAt: fallbackOwner.updatedAt?.toISOString?.() ?? new Date(0).toISOString(),
      },
    };
  });

  // Fisher–Yates shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return NextResponse.json({ items }, { status: 200 });
}
