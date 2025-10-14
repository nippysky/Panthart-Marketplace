// app/api/marketplace/listings/attach-tx/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

/** Create-or-get a User by wallet (best-effort). */
async function upsertUserByWallet(addr: string | null | undefined) {
  if (!addr) return null;
  const wallet = addr.toLowerCase();
  let user = await prisma.user.findUnique({ where: { walletAddress: wallet } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        walletAddress: wallet,
        username: wallet.slice(0, 6) + "…" + wallet.slice(-4),
        profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${wallet}`,
      },
    });
  }
  return user;
}

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

/**
 * Body:
 * {
 *   action: "CREATED" | "SOLD" | "CANCELLED" | "EXPIRED",
 *   contract: string,
 *   tokenId: string,
 *   sellerAddress?: string, // used to disambiguate ERC1155 per-seller rows
 *   buyerAddress?: string,  // required for SOLD
 *   txHash?: string
 * }
 */
export async function POST(req: NextRequest) {
  await prismaReady;

  try {
    const body = await req.json();
    const { action, contract, tokenId, sellerAddress, buyerAddress, txHash } = body || {};

    if (!action) return bad("Missing action");
    if (!contract || !tokenId) return bad("Missing contract or tokenId");

    // Resolve NFT row (we operate by nftId internally)
    const nft = await prisma.nFT.findFirst({
      where: { contract: { equals: contract, mode: "insensitive" }, tokenId },
      select: { id: true },
    });
    if (!nft) return bad("NFT not found", 404);

    // CREATED needs no listing lookup (creation endpoint is responsible for LISTING activity)
    if (action === "CREATED") {
      return NextResponse.json({ ok: true });
    }

    // Build "active listing" filter (ERC721: single current ACTIVE; ERC1155: ACTIVE per seller)
    const whereListing: any = {
      nftId: nft.id,
      status: "ACTIVE" as const,
    };
    if (sellerAddress) {
      whereListing.sellerAddress = { equals: sellerAddress, mode: "insensitive" as const };
    }

    const listing = await prisma.marketplaceListing.findFirst({
      where: whereListing,
      orderBy: { createdAt: "desc" },
    });
    if (!listing) return bad("Active listing not found for action");

    // Helper to atomically flip listing status only if still ACTIVE
    async function flipStatus(
      listingId: string,
      status: "SOLD" | "CANCELLED" | "EXPIRED",
      patch: Record<string, any> = {}
    ) {
      const res = await prisma.marketplaceListing.updateMany({
        where: { id: listingId, status: "ACTIVE" },
        data: {
          status,
          endTime: new Date(), // close immediately
          ...patch,
        },
      });
      return res.count === 1;
    }

    /* -------- CANCELLED / EXPIRED -------- */
    if (action === "CANCELLED" || action === "EXPIRED") {
      const status = action === "CANCELLED" ? "CANCELLED" : "EXPIRED";
      const ok = await flipStatus(listing.id, status, { txHashCancelled: txHash ?? undefined });
      if (!ok) return bad("Listing already updated", 409);

      // Best-effort: visually return ownership to seller (721 semantics; harmless for 1155)
      const sellerUser = await upsertUserByWallet(listing.sellerAddress);
      if (sellerUser) {
        await prisma.nFT.update({ where: { id: nft.id }, data: { ownerId: sellerUser.id } });
      }

      // Activity card (Unlisting). No price fields here.
      await prisma.nFTActivity.create({
        data: {
          nftId: nft.id,
          contract,
          tokenId,
          type: status, // "CANCELLED" | "EXPIRED" (Activity tab normalizes to Unlisting)
          fromAddress: listing.sellerAddress,
          toAddress: listing.sellerAddress,
          priceEtnWei: null,
          txHash: txHash ?? `listing-${listing.id}-${status.toLowerCase()}`,
          logIndex: 0,
          blockNumber: Date.now() % 1_000_000_000,
          timestamp: new Date(),
          marketplace: "Panthart",
        },
      });

      return NextResponse.json({ ok: true });
    }

    /* -------------------- SOLD -------------------- */
    if (action === "SOLD") {
      if (!buyerAddress) return bad("Missing buyerAddress for SOLD");

      const ok = await flipStatus(listing.id, "SOLD", { txHashFilled: txHash ?? undefined });
      if (!ok) return bad("Listing already updated", 409);

      // Best-effort: set buyer as owner (721 semantics; harmless for 1155 visual owner)
      const buyerUser = await upsertUserByWallet(buyerAddress);
      if (buyerUser) {
        await prisma.nFT.update({ where: { id: nft.id }, data: { ownerId: buyerUser.id } });
      }

      // Determine if the listing is native (ETN) or ERC20
      const isNative =
        listing.priceEtnWei && listing.priceEtnWei.toString && listing.priceEtnWei.toString() !== "0";

      // Persist canonical sale row (source of truth for Activity tab "Sale" cards)
      await prisma.marketplaceSale.upsert({
        where: {
          txHash_logIndex: { txHash: txHash ?? `sale-${listing.id}`, logIndex: 0 },
        },
        update: {},
        create: {
          nftId: nft.id,
          buyerAddress: (buyerAddress as string).toLowerCase(),
          sellerAddress: listing.sellerAddress.toLowerCase(),
          quantity: listing.quantity,
          priceEtnWei: isNative ? (listing.priceEtnWei as any) : ("0" as any),
          currencyId: isNative ? undefined : listing.currencyId ?? undefined,
          priceTokenAmount: isNative ? undefined : (listing.priceTokenAmount as any),
          txHash: txHash ?? `sale-${listing.id}`,
          logIndex: 0,
          blockNumber: Date.now() % 1_000_000_000,
          timestamp: new Date(),
        },
      });

      // Activity (SALE) — token-first rawData shape for non-native
      await prisma.nFTActivity.create({
        data: {
          nftId: nft.id,
          contract,
          tokenId,
          type: "SALE",
          fromAddress: listing.sellerAddress,
          toAddress: (buyerAddress as string).toLowerCase(),
          // Native ETN goes in priceEtnWei; tokens go into rawData (currencyId + priceTokenAmount)
          priceEtnWei: isNative ? (listing.priceEtnWei as any) : null,
          txHash: txHash ?? `sale-${listing.id}`,
          logIndex: 0,
          blockNumber: Date.now() % 1_000_000_000,
          timestamp: new Date(),
          marketplace: "Panthart",
          rawData: !isNative
            ? {
                currencyId: listing.currencyId,
                priceTokenAmount: listing.priceTokenAmount?.toString?.() ?? null,
              }
            : undefined,
        },
      });

      return NextResponse.json({ ok: true });
    }

    return bad("Unsupported action");
  } catch (err: any) {
    console.error("[POST /marketplace/listings/attach-tx] error:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Server error" }, { status: 500 });
  }
}
