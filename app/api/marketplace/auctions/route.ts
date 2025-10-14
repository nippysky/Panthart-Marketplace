// app/api/marketplace/auctions/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

const isPos = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
};
const isNonNeg = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0;
};

/** Convert human (e.g. "1.23") into base-units string for given decimals. */
function toWeiString(amount: string, decimals: number) {
  const [intPart = "0", fracRaw = ""] = String(amount).trim().split(".");
  if (!/^\d+$/.test(intPart) || (fracRaw && !/^\d+$/.test(fracRaw))) {
    throw new Error("Invalid number");
  }
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  return `${intPart}${frac}`.replace(/^0+(?=\d)/, "");
}

export async function POST(req: NextRequest) {
  await prismaReady;

  try {
    const {
      contract,
      tokenId,
      standard,
      sellerAddress,
      currencyId,
      startPrice,
      minIncrement,
      quantity,
      startTimeISO,
      endTimeISO,
      txHashCreated,
    } = await req.json();

    if (!contract || !tokenId) return bad("Missing contract or tokenId");
    if (!sellerAddress) return bad("Missing sellerAddress");
    if (!currencyId) return bad("Missing currencyId");
    if (!isPos(startPrice)) return bad("Start price must be positive");
    if (!isNonNeg(minIncrement)) return bad("Min increment cannot be negative");
    if (!endTimeISO) return bad("End time is required");

    const nft = await prisma.nFT.findFirst({
      where: { contract: { equals: contract, mode: "insensitive" }, tokenId },
      select: { id: true },
    });
    if (!nft) return bad("NFT not found", 404);

    const currency = await prisma.currency.findUnique({
      where: { id: currencyId },
      select: { id: true, symbol: true, decimals: true, kind: true, tokenAddress: true },
    });
    if (!currency) return bad("Currency not found");

    const decimals = currency.decimals ?? 18;
    const startWei = toWeiString(startPrice, decimals);
    const incWei = toWeiString(minIncrement, decimals);

    let qty = 1;
    if (standard === "ERC1155") {
      if (!quantity) return bad("Quantity is required for ERC1155");
      const q = Number(quantity);
      if (!Number.isInteger(q) || q <= 0) return bad("Quantity must be a positive integer");
      qty = q;
    }

    const startTime = startTimeISO ? new Date(startTimeISO) : new Date();
    const endTime = new Date(endTimeISO);
    if (!(endTime.getTime() > startTime.getTime())) {
      return bad("End time must be later than start time");
    }

    // Persist auction
    const auctionData: any = {
      nftId: nft.id,
      sellerAddress,
      quantity: qty,
      status: "ACTIVE",
      startTime,
      endTime,
      txHashCreated: txHashCreated ?? undefined,
      minIncrementEtnWei: null,
      minIncrementTokenAmount: null,
    };

    const isNative = currency.kind === "NATIVE";

    if (isNative) {
      auctionData.startPriceEtnWei = startWei;
      auctionData.minIncrementEtnWei = incWei;
      auctionData.currencyId = null;
      auctionData.startPriceTokenAmount = null;
    } else {
      auctionData.currencyId = currency.id;
      auctionData.startPriceTokenAmount = startWei;
      auctionData.minIncrementTokenAmount = incWei;
      auctionData.startPriceEtnWei = "0";
    }

    const created = await prisma.auction.create({ data: auctionData });

    // Activity: AUCTION (creation). Use token-first rawData for ERC20.
    await prisma.nFTActivity.upsert({
      where: {
        txHash_logIndex: {
          txHash: created.txHashCreated ?? `auction-${created.id}`,
          logIndex: 0,
        },
      },
      update: {},
      create: {
        nftId: nft.id,
        contract,
        tokenId,
        type: "AUCTION",
        fromAddress: sellerAddress,
        toAddress: "",
        priceEtnWei: isNative ? (auctionData.startPriceEtnWei as string) : null,
        txHash: created.txHashCreated ?? `auction-${created.id}`,
        logIndex: 0,
        blockNumber: created.createdAt.getTime() % 1_000_000_000,
        timestamp: created.createdAt,
        marketplace: "Panthart",
        rawData: !isNative
          ? {
              // token-first shape: lets the Activity reader resolve meta via currencyId
              currencyId: currency.id,
              priceTokenAmount: auctionData.startPriceTokenAmount,
            }
          : undefined,
      },
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (err: any) {
    console.error("[POST /marketplace/auctions] error:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Server error" }, { status: 500 });
  }
}
