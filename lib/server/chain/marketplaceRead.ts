// lib/server/chain/marketplaceRead.ts
import { ethers } from "ethers";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";

function rpcUrl(): string {
  return (
    process.env.RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    process.env.EVM_RPC_URL ||
    ""
  );
}

function provider(): ethers.JsonRpcProvider {
  const url = rpcUrl();
  if (!url) throw new Error("RPC_URL missing for server reads");
  return new ethers.JsonRpcProvider(url);
}

export type ActiveAuctionArgs = {
  marketplace: `0x${string}`;
  collection: `0x${string}`;
  tokenId: bigint;
  /** Use exact labels you use across the app */
  standard: "ERC721" | "ERC1155";
  /** required for ERC1155 lookups */
  seller?: `0x${string}`;
};

/**
 * Resolve the on-chain auction id for a token (721) or seller+token (1155).
 * Returns null if no active auction is present.
 */
export async function readActiveAuctionId(
  args: ActiveAuctionArgs
): Promise<bigint | null> {
  const c = new ethers.Contract(args.marketplace, MARKETPLACE_CORE_ABI, provider());
  if (args.standard === "ERC1155") {
    if (!args.seller) return null;
    const id: bigint = await c.activeAuction1155BySeller(
      args.collection,
      args.tokenId,
      args.seller
    );
    return id && id !== 0n ? id : null;
  }
  const id: bigint = await c.activeAuctionForToken(args.collection, args.tokenId);
  return id && id !== 0n ? id : null;
}

/**
 * Read the full auction row by its id and normalize to a compact object
 * that matches the shapes you use in the UI.
 */
export async function readAuctionRow(
  marketplace: `0x${string}`,
  auctionId: bigint
) {
  const c = new ethers.Contract(marketplace, MARKETPLACE_CORE_ABI, provider());
  const raw = await c.auctions(auctionId);
  return {
    seller: String(raw.seller) as `0x${string}`,
    currency: String(raw.currency) as `0x${string}`,
    startPrice: BigInt(raw.startPrice),
    minIncrement: BigInt(raw.minIncrement),
    start: Number(raw.startTime), // seconds
    end: Number(raw.endTime),     // seconds
    highestBidder: String(raw.highestBidder) as `0x${string}`,
    highestBid: BigInt(raw.highestBid),
    bidsCount: Number(raw.bidsCount || 0),
    settled: Boolean(raw.settled),
  };
}

/**
 * Convenience: single call that returns { id, row } or null.
 */
export async function readActiveAuctionSnapshot(
  args: ActiveAuctionArgs
): Promise<{ id: bigint; row: Awaited<ReturnType<typeof readAuctionRow>> } | null> {
  const id = await readActiveAuctionId(args);
  if (!id) return null;
  const row = await readAuctionRow(args.marketplace, id);
  return { id, row };
}
