// app/api/marketplace/auctions/attach-tx/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { AuctionStatus, CurrencyKind } from "@/lib/generated/prisma";

type Body =
  | {
      action: "BID";
      auctionId: string;
      contract: string;
      tokenId: string;
      bidder: string;
      amountWei: string;         // base units of bid
      txHash?: string | null;
      newEndTimeISO?: string | null;
    }
  | {
      action: "CANCELLED";
      auctionId?: string;
      contract?: string;
      tokenId?: string;
      sellerAddress?: string | null;
      txHash?: string | null;
    }
  | {
      action: "ENDED";
      auctionId: string;
      contract: string;
      tokenId: string;
      winner: string;
      priceWei: string;          // final price in base units
      royaltyPaidWei?: string | null;
      feePaidWei?: string | null;
      txHash?: string | null;
    };

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

export async function POST(req: NextRequest) {
  await prismaReady;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  if (!body?.action) return bad("Missing action");

  try {
    /* ---------------- BID ---------------- */
    if (body.action === "BID") {
      const a = await prisma.auction.findUnique({
        where: { id: body.auctionId },
        select: {
          id: true,
          nftId: true,
          currency: {
            select: { id: true, kind: true, symbol: true, tokenAddress: true, decimals: true },
          },
        },
      });
      if (!a) return bad("Auction not found", 404);

      const isNative = a.currency?.kind === CurrencyKind.NATIVE;

      // Update "highest bid" (best-effort)
      await prisma.auction.update({
        where: { id: a.id },
        data: {
          highestBidder: body.bidder,
          ...(isNative
            ? { highestBidEtnWei: body.amountWei }
            : { highestBidTokenAmount: body.amountWei }),
          ...(body.newEndTimeISO ? { endTime: new Date(body.newEndTimeISO) } : {}),
        },
      });

      // Activity log: BID (token-first rawData for ERC20)
      await prisma.nFTActivity.create({
        data: {
          nftId: a.nftId,
          contract: body.contract,
          tokenId: body.tokenId,
          type: "BID",
          fromAddress: body.bidder,
          toAddress: "",
          priceEtnWei: isNative ? (body.amountWei as any) : null,
          txHash: body.txHash ?? `bid-${a.id}-${Date.now()}`,
          logIndex: 0,
          blockNumber: Math.floor(Date.now() / 1000),
          timestamp: new Date(),
          marketplace: "Panthart",
          rawData: !isNative
            ? {
                currencyId: a.currency?.id,
                amountWei: body.amountWei, // reader handles amountWei for bids
              }
            : undefined,
        },
      });

      return NextResponse.json({ ok: true });
    }

    /* ------------- CANCELLED ------------- */
    if (body.action === "CANCELLED") {
      // Prefer explicit id; otherwise resolve from (contract + tokenId [+ seller])
      let resolvedId = (body as any).auctionId as string | undefined;

      if (!resolvedId) {
        const contract = (body as any).contract as string | undefined;
        const tokenId = (body as any).tokenId as string | undefined;
        const seller = ((body as any).sellerAddress || "") as string;

        if (!contract || !tokenId) {
          return bad("auctionId or (contract + tokenId) is required for CANCELLED");
        }

        const auction = await prisma.auction.findFirst({
          where: {
            status: AuctionStatus.ACTIVE,
            nft: {
              contract: { equals: contract, mode: "insensitive" },
              tokenId,
            },
            ...(seller
              ? { sellerAddress: { equals: seller, mode: "insensitive" } }
              : {}),
          },
          select: { id: true },
          orderBy: { createdAt: "desc" },
        });

        if (!auction) return bad("Active auction not found for token", 404);
        resolvedId = auction.id;
      }

      await prisma.auction.update({
        where: { id: resolvedId },
        data: {
          status: AuctionStatus.CANCELLED,
          txHashCancelled: (body as any)?.txHash ?? undefined,
          endTime: new Date(), // stop any countdown-only UI
        },
      });

      // (Optional) You could also insert a "CANCELLED_AUCTION" activity here.

      return NextResponse.json({ ok: true });
    }

    /* ---------------- ENDED --------------- */
    if (body.action === "ENDED") {
      const auc = await prisma.auction.findUnique({
        where: { id: body.auctionId },
        select: {
          id: true,
          nftId: true,
          sellerAddress: true,
          quantity: true,
          currency: { select: { id: true, kind: true, symbol: true, tokenAddress: true } },
          nft: { select: { contract: true, tokenId: true } },
        },
      });
      if (!auc) return bad("Auction not found", 404);

      const isNative = auc.currency?.kind === CurrencyKind.NATIVE;

      // Mark ENDED + tx hash
      await prisma.auction.update({
        where: { id: auc.id },
        data: { status: AuctionStatus.ENDED, txHashFinalized: body.txHash ?? undefined },
      });

      // Best-effort: reflect ownership to winner for 721 (harmless if 1155)
      await prisma.nFT
        .update({
          where: { id: auc.nftId },
          data: {
            owner: {
              connect: { walletAddress: body.winner.toLowerCase() },
            },
          },
        })
        .catch(() => {});

      // Canonical sale row (Activity tab reads from here for "Sale")
      await prisma.marketplaceSale.create({
        data: {
          nftId: auc.nftId,
          buyerAddress: body.winner,
          sellerAddress: auc.sellerAddress,
          quantity: auc.quantity,
          priceEtnWei: isNative ? (body.priceWei as any) : "0",
          royaltyPaidWei: (body.royaltyPaidWei as any) ?? null,
          marketplaceFeePaidWei: (body.feePaidWei as any) ?? null,
          currencyId: !isNative ? auc.currency?.id ?? undefined : undefined,
          priceTokenAmount: !isNative ? (body.priceWei as any) : null,
          royaltyPaidTokenAmount: null,
          feePaidTokenAmount: null,
          royaltyRecipient: null,
          marketplaceFeeRecipient: null,
          txHash: body.txHash ?? `auction-final-${auc.id}`,
          logIndex: 0,
          blockNumber: Math.floor(Date.now() / 1000),
          timestamp: new Date(),
        },
      });

      // Activity (SALE). Use token-first rawData for ERC-20.
      await prisma.nFTActivity.create({
        data: {
          nftId: auc.nftId,
          contract: body.contract,
          tokenId: body.tokenId,
          type: "SALE",
          fromAddress: auc.sellerAddress,
          toAddress: body.winner,
          priceEtnWei: isNative ? (body.priceWei as any) : null,
          txHash: body.txHash ?? `auction-final-${auc.id}`,
          logIndex: 0,
          blockNumber: Math.floor(Date.now() / 1000),
          timestamp: new Date(),
          marketplace: "Panthart",
          rawData: !isNative
            ? {
                currencyId: auc.currency?.id,
                priceTokenAmount: body.priceWei,
              }
            : undefined,
        },
      });

      return NextResponse.json({ ok: true });
    }

    return bad("Unsupported action");
  } catch (e: any) {
    console.error("[POST auctions/attach-tx] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
