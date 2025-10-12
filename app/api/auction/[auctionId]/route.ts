export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { CurrencyKind } from "@/lib/generated/prisma";

/* ----------------------------- helpers ----------------------------- */
function toNum(x: any): number | undefined {
  if (x == null) return undefined;
  const n = Number(x.toString?.() ?? x);
  return Number.isFinite(n) ? n : undefined;
}
function fromWeiStr(wei?: any, decimals = 18): string | undefined {
  const n = toNum(wei);
  if (n == null) return undefined;
  return (n / 10 ** decimals).toString();
}

/* ------------------------------- Route ------------------------------ */
type Ctx = { params: Promise<{ auctionId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  await prismaReady;
  const { auctionId } = await ctx.params;

  try {
    const auc = await prisma.auction.findUnique({
      where: { id: auctionId },
      select: {
        id: true,
        sellerAddress: true,
        quantity: true,
        highestBidder: true,
        startTime: true,
        endTime: true,
        status: true,

        // currency metadata
        currency: {
          select: {
            id: true,
            symbol: true,
            decimals: true,
            kind: true,
            tokenAddress: true,
          },
        },

        // prices (native vs erc20 columns)
        startPriceEtnWei: true,
        highestBidEtnWei: true,
        minIncrementEtnWei: true,
        startPriceTokenAmount: true,
        highestBidTokenAmount: true,
        minIncrementTokenAmount: true,

        // NFT basics
        nft: {
          select: {
            contract: true,
            tokenId: true,
            standard: true,
            name: true,
            imageUrl: true,
          },
        },

        // NEW: quick count for UI
        _count: {
          select: { bids: true },
        },
      },
    });

    if (!auc) {
      const resp = NextResponse.json({ active: false, auction: null });
      resp.headers.set("Cache-Control", "s-maxage=10, stale-while-revalidate=60");
      return resp;
    }

    const isNative =
      (auc.currency?.kind ?? CurrencyKind.NATIVE) === CurrencyKind.NATIVE;
    const decimals = isNative ? 18 : (auc.currency?.decimals ?? 18);

    // Best-effort owner to keep "Escrow" badge accurate:
    // If the auction is ACTIVE, the asset should be in marketplace escrow.
    // We keep the original casing of the env var for display.
    const escrowAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS || null;
    const ownerWallet =
      auc.status === "ACTIVE" && escrowAddr ? escrowAddr : null;

    const payload = {
      active: auc.status === "ACTIVE",
      auction: {
        id: auc.id,
        nft: {
          contract: auc.nft.contract, // original casing from DB
          tokenId: auc.nft.tokenId,
          standard: (auc.nft.standard ?? "ERC721") as "ERC721" | "ERC1155" | string,
          name: auc.nft.name ?? null,
          image: auc.nft.imageUrl ?? null,
        },
        // Owner exposed for client "Escrow" badge logic (keep original casing)
        owner: ownerWallet ? { walletAddress: ownerWallet } : null,

        sellerAddress: auc.sellerAddress, // keep original casing
        quantity: auc.quantity,
        status: auc.status,
        startTime: auc.startTime.toISOString(),
        endTime: auc.endTime.toISOString(),
        currency: {
          id: auc.currency?.id ?? null,
          kind: isNative ? "NATIVE" : "ERC20",
          symbol: auc.currency?.symbol ?? (isNative ? "ETN" : "ERC20"),
          decimals,
          tokenAddress: auc.currency?.tokenAddress ?? null,
        },
        amounts: {
          startPriceWei: (isNative ? auc.startPriceEtnWei : auc.startPriceTokenAmount)?.toString(),
          minIncrementWei: (isNative ? auc.minIncrementEtnWei : auc.minIncrementTokenAmount)?.toString(),
          highestBidWei: (isNative ? auc.highestBidEtnWei : auc.highestBidTokenAmount)?.toString() ?? null,
          startPrice: fromWeiStr(isNative ? auc.startPriceEtnWei : auc.startPriceTokenAmount, decimals),
          minIncrement: fromWeiStr(isNative ? auc.minIncrementEtnWei : auc.minIncrementTokenAmount, decimals),
          highestBid: fromWeiStr(isNative ? auc.highestBidEtnWei : auc.highestBidTokenAmount, decimals) ?? null,
        },
        highestBidder: auc.highestBidder ?? null, // keep original casing
        bidsCount: auc._count?.bids ?? 0, // NEW
      },
    };

    const resp = NextResponse.json(payload);
    resp.headers.set("Cache-Control", "s-maxage=10, stale-while-revalidate=60");
    return resp;
  } catch (e) {
    console.error("[api auction by id] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
