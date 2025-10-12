// app/api/auction/active/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { AuctionStatus, CurrencyKind } from "@/lib/generated/prisma";

function fromWeiStr(wei?: any, decimals = 18): string | undefined {
  const n = Number((wei as any)?.toString?.() ?? wei);
  if (!Number.isFinite(n)) return undefined;
  return (n / 10 ** decimals).toString();
}

export async function GET(req: NextRequest) {
  await prismaReady;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 24), 60);
  const cursor = searchParams.get("cursor");

  // optional filters
  const contractParam = searchParams.get("contract") || undefined;
  const tokenIdParam = searchParams.get("tokenId") || undefined;

  try {
    const whereBase: any = {
      status: AuctionStatus.ACTIVE,
      endTime: { gt: new Date() },
    };

    if (contractParam || tokenIdParam) {
      whereBase.nft = {};
      if (contractParam) {
        whereBase.nft.contract = { equals: contractParam, mode: "insensitive" as const };
      }
      if (tokenIdParam) {
        whereBase.nft.tokenId = tokenIdParam;
      }
    }

    const rows = await prisma.auction.findMany({
      where: whereBase,
      orderBy: { endTime: "asc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        startTime: true,
        endTime: true,
        sellerAddress: true,
        quantity: true,

        startPriceEtnWei: true,
        highestBidEtnWei: true,
        startPriceTokenAmount: true,
        highestBidTokenAmount: true,

        currency: { select: { id: true, symbol: true, decimals: true, kind: true, tokenAddress: true } },
        nft: { select: { contract: true, tokenId: true, name: true, imageUrl: true, standard: true } },
      },
    });

    // Map seller => username (case-insensitive on citext)
    const sellers = Array.from(
      new Set(rows.map(r => r.sellerAddress).filter(Boolean) as string[])
    );
    const users = sellers.length
      ? await prisma.user.findMany({
          where: { walletAddress: { in: sellers } },
          select: { walletAddress: true, username: true },
        })
      : [];
    const userByWalletLC = new Map(users.map(u => [u.walletAddress.toLowerCase(), u.username || null]));

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, -1) : rows;

    const items = page.map(a => {
      const isNative = (a.currency?.kind ?? CurrencyKind.NATIVE) === CurrencyKind.NATIVE;
      const decimals = isNative ? 18 : (a.currency?.decimals ?? 18);
      const highestWei = isNative ? a.highestBidEtnWei : a.highestBidTokenAmount;
      const startWei   = isNative ? a.startPriceEtnWei : a.startPriceTokenAmount;

      const sellerUsername = a.sellerAddress
        ? userByWalletLC.get(a.sellerAddress.toLowerCase()) ?? null
        : null;

      return {
        id: a.id,
        startTime: a.startTime.toISOString(),
        endTime: a.endTime.toISOString(),
        quantity: a.quantity ?? 1,
        seller: {
          address: a.sellerAddress,
          username: sellerUsername,
        },
        nft: {
          contract: a.nft.contract,
          tokenId: a.nft.tokenId,
          name:
            a.nft.name ??
            `${a.nft.contract.slice(0, 6)}…${a.nft.contract.slice(-4)} #${a.nft.tokenId}`,
          image: a.nft.imageUrl,
          standard: a.nft.standard ?? "ERC721",
        },
        currency: {
          id: a.currency?.id ?? null,
          kind: isNative ? "NATIVE" : "ERC20",
          symbol: a.currency?.symbol ?? (isNative ? "ETN" : "ERC20"),
          decimals,
          tokenAddress: a.currency?.tokenAddress ?? null,
        },
        price: {
          currentWei: (highestWei ?? startWei)?.toString(),
          current: fromWeiStr(highestWei ?? startWei, decimals),
        },
      };
    });

    const nextCursor = hasMore ? rows[rows.length - 1].id : null;
    return NextResponse.json({ items, nextCursor });
  } catch (e) {
    console.error("[api auction active] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
