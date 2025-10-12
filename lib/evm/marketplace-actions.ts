// lib/evm/marketplace-actions.ts
"use client";

/**
 * Marketplace actions (tidy helpers)
 * - Ensures ERC721/1155 approvals before listing/auction
 * - Validates allowed currency
 * - Converts human prices/time to on-chain units
 * - Creates & cancels listings/auctions
 * - Reads active listing/auction using a PUBLIC provider (no wallet dependency)
 * - Utility to read ERC20 symbol/decimals
 * - Utility to check existing setApprovalForAll status
 *
 * IMPORTANT: We normalize contract struct keys:
 *   - listings(..) returns { ..., startTime, endTime, ... }  -> UI expects { start, end }
 *   - auctions(..)  returns { ..., startTime, endTime, ... } -> UI expects { start, end }
 * So readActiveListing / readActiveAuction map these for you.
 */

import { ethers } from "ethers";
import { getBrowserSigner, ZERO_ADDRESS } from "./getSigner";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";

/* ------------------------------------------------------------------ */
/* Minimal ABIs for approvals & metadata                               */
/* ------------------------------------------------------------------ */
const ERC721_MIN_ABI = [
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
] as const;

// ERC1155 uses the same approval signatures
const ERC1155_MIN_ABI = ERC721_MIN_ABI;

const ERC20_META_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
] as const;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
export type Standard = "ERC721" | "ERC1155";

export type Currency = {
  kind: "NATIVE" | "ERC20";
  tokenAddress?: `0x${string}` | null;
  decimals: number;
  symbol: string;
};

type ListingRowRaw = {
  seller: `0x${string}`;
  token: `0x${string}`;
  tokenId: bigint;
  quantity: bigint;
  standard: bigint;
  currency: `0x${string}`;
  price: bigint;
  startTime: bigint;
  endTime: bigint;
  active: boolean;
};

type AuctionRowRaw = {
  seller: `0x${string}`;
  token: `0x${string}`;
  tokenId: bigint;
  quantity: bigint;
  standard: bigint;
  currency: `0x${string}`;
  startPrice: bigint;
  minIncrement: bigint;
  startTime: bigint;
  endTime: bigint;
  highestBidder: `0x${string}`;
  highestBid: bigint;
  bidsCount: number;
  settled: boolean;
};

type ListingRowNormalized = {
  seller: `0x${string}`;
  currency: `0x${string}`;
  price: bigint;
  quantity: bigint;
  /** unix seconds */
  start: bigint;
  /** unix seconds (0 => no expiry) */
  end: bigint;
  standard: bigint;
};

type AuctionRowNormalized = {
  seller: `0x${string}`;
  currency: `0x${string}`;
  startPrice: bigint;
  minIncrement: bigint;
  /** unix seconds */
  start: bigint;
  /** unix seconds */
  end: bigint;
  highestBidder: `0x${string}`;
  highestBid: bigint;
  bidsCount: number;
  standard: bigint;
  settled: boolean;
};

/* ------------------------------------------------------------------ */
/* Read-only provider                                                  */
/* ------------------------------------------------------------------ */
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.RPC_URL ||
  "https://rpc.ankr.com/electroneum";

const publicProvider = new ethers.JsonRpcProvider(RPC_URL);

/* ------------------------------------------------------------------ */
/* Utils                                                               */
/* ------------------------------------------------------------------ */
function toUnixSeconds(iso?: string, fallbackNow = true): number {
  if (!iso) return fallbackNow ? Math.floor(Date.now() / 1000) : 0;
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? Math.floor(d.getTime() / 1000)
    : Math.floor(Date.now() / 1000);
}

function toWei(amount: string, decimals: number): bigint {
  return ethers.parseUnits((amount || "0").trim(), decimals);
}

export function fromWei(wei: bigint, decimals: number): string {
  return ethers.formatUnits(wei, decimals);
}

function standardEnum(s: Standard): number {
  return s === "ERC721" ? 0 : 1; // must match the contract's enum
}

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */
async function ensureApprovalForAll(
  standard: Standard,
  collection: `0x${string}`,
  operator: `0x${string}`,
  signer: ethers.Signer
): Promise<void> {
  const owner = await signer.getAddress();
  const abi = standard === "ERC721" ? ERC721_MIN_ABI : ERC1155_MIN_ABI;
  const nft = new ethers.Contract(collection, abi, signer);
  const approved: boolean = await nft.isApprovedForAll(owner, operator);
  if (!approved) {
    const tx = await nft.setApprovalForAll(operator, true);
    await tx.wait();
  }
}

/** Read-only helper (no wallet needed) */
export async function hasMarketplaceApproval(args: {
  standard: Standard;
  collection: `0x${string}`;
  owner?: `0x${string}`; // optional override
}): Promise<boolean> {
  const { signer } = await getBrowserSigner();
  const operator = process.env
    .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
  const abi = args.standard === "ERC721" ? ERC721_MIN_ABI : ERC1155_MIN_ABI;
  const reader = new ethers.Contract(args.collection, abi, publicProvider);
  const owner = (args.owner as string) || (await signer.getAddress());
  return await reader.isApprovedForAll(owner, operator);
}

/* ------------------------------------------------------------------ */
/* ERC20 metadata                                                      */
/* ------------------------------------------------------------------ */
export async function getErc20Meta(
  token: `0x${string}`
): Promise<{ symbol: string; decimals: number }> {
  const c = new ethers.Contract(token, ERC20_META_ABI, publicProvider);
  const [symbol, decimals] = await Promise.all([c.symbol(), c.decimals()]);
  return { symbol, decimals: Number(decimals) || 18 };
}

/* ------------------------------------------------------------------ */
/* Create Listing                                                      */
/* ------------------------------------------------------------------ */
export async function createListingOnChain(args: {
  collection: `0x${string}`;
  tokenId: bigint;
  quantity: bigint; // 1n for ERC721
  standard: Standard;
  currency: Currency;
  price: string; // human
  startTimeISO?: string;
  endTimeISO?: string; // 0 => no end
}) {
  const { signer, chainId } = await getBrowserSigner();
  const expected = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 52014);
  if (Number(chainId) !== expected)
    throw new Error("Wrong network. Please switch to the supported chain.");

  const mktAddr = process.env
    .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
  const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);

  // Approvals (defensive — UI also checks)
  await ensureApprovalForAll(args.standard, args.collection, mktAddr, signer);

  // Currency & price
  const currencyAddr =
    args.currency.kind === "NATIVE"
      ? ZERO_ADDRESS
      : (args.currency.tokenAddress || ZERO_ADDRESS);
  const allowed: boolean = await mkt.currencyAllowed(currencyAddr);
  if (!allowed) throw new Error(`${args.currency.symbol} is not currently allowed.`);

  const priceWei = toWei(args.price, args.currency.decimals);

  // Time window (start now if not provided; end 0 = indefinite)
  const start = toUnixSeconds(args.startTimeISO, true);
  const end = args.endTimeISO ? toUnixSeconds(args.endTimeISO, false) : 0;

  const tx = await mkt.createListing(
    args.collection,
    args.tokenId,
    args.quantity,
    currencyAddr,
    priceWei,
    start,
    end,
    standardEnum(args.standard)
  );
  const rc = await tx.wait();
  return { txHash: rc?.hash ?? tx.hash };
}

/* ------------------------------------------------------------------ */
/* Create Auction                                                      */
/* ------------------------------------------------------------------ */
export async function createAuctionOnChain(args: {
  collection: `0x${string}`;
  tokenId: bigint;
  quantity: bigint; // 1n for 721; >=1 for 1155
  standard: Standard;
  currency: Currency;
  startPrice: string;
  minIncrement: string;
  startTimeISO?: string; // default now
  endTimeISO: string; // required by UI
}) {
  const { signer, chainId } = await getBrowserSigner();
  const expected = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 52014);
  if (Number(chainId) !== expected)
    throw new Error("Wrong network. Please switch to the supported chain.");

  const mktAddr = process.env
    .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
  const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);

  await ensureApprovalForAll(args.standard, args.collection, mktAddr, signer);

  const currencyAddr =
    args.currency.kind === "NATIVE"
      ? ZERO_ADDRESS
      : (args.currency.tokenAddress || ZERO_ADDRESS);
  const allowed: boolean = await mkt.currencyAllowed(currencyAddr);
  if (!allowed) throw new Error(`${args.currency.symbol} is not currently allowed.`);

  const startPriceWei = toWei(args.startPrice, args.currency.decimals);
  const minIncWei = toWei(args.minIncrement, args.currency.decimals);
  const start = toUnixSeconds(args.startTimeISO, true);
  const end = toUnixSeconds(args.endTimeISO, false);

  const tx = await mkt.createAuction(
    args.collection,
    args.tokenId,
    args.quantity,
    currencyAddr,
    startPriceWei,
    minIncWei,
    start,
    end,
    standardEnum(args.standard)
  );
  const rc = await tx.wait();
  return { txHash: rc?.hash ?? tx.hash };
}

/* ------------------------------------------------------------------ */
/* Normalizers (ABI -> UI shape)                                      */
/* ------------------------------------------------------------------ */
function normalizeListingRow(row: ListingRowRaw): ListingRowNormalized {
  return {
    seller: row.seller,
    currency: row.currency,
    price: row.price,
    quantity: row.quantity,
    // **** KEY: map ABI's startTime/endTime -> start/end ****
    start: row.startTime,
    end: row.endTime,
    standard: row.standard,
  };
}

function normalizeAuctionRow(row: AuctionRowRaw): AuctionRowNormalized {
  return {
    seller: row.seller,
    currency: row.currency,
    startPrice: row.startPrice,
    minIncrement: row.minIncrement,
    // **** KEY: map ABI's startTime/endTime -> start/end ****
    start: row.startTime,
    end: row.endTime,
    highestBidder: row.highestBidder,
    highestBid: row.highestBid,
    bidsCount: Number(row.bidsCount),
    standard: row.standard,
    settled: row.settled,
  };
}

/* ------------------------------------------------------------------ */
/* Read active listing (public provider)                               */
/* ------------------------------------------------------------------ */
export async function readActiveListing(args: {
  collection: `0x${string}`;
  tokenId: bigint;
  standard: Standard;
  seller?: `0x${string}` | null; // used for 1155-per-seller mapping
}): Promise<
  | {
      id: bigint;
      row: ListingRowNormalized;
    }
  | null
> {
  const mktAddr = process.env
    .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
  const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, publicProvider);

  let id: bigint = 0n;
  try {
    id = await mkt.activeListingForToken(args.collection, args.tokenId);
  } catch {}
  if (id === 0n && args.standard === "ERC1155" && args.seller) {
    try {
      id = await mkt.activeListing1155BySeller(
        args.collection,
        args.tokenId,
        args.seller
      );
    } catch {}
  }
  if (id === 0n) return null;

  const raw = (await mkt.listings(id)) as ListingRowRaw;
  const row = normalizeListingRow(raw);
  return { id, row };
}

/* ------------------------------------------------------------------ */
/* Read active auction (public provider)                               */
/* ------------------------------------------------------------------ */
export async function readActiveAuction(args: {
  collection: `0x${string}`;
  tokenId: bigint;
  standard: Standard;
  seller?: `0x${string}` | null;
}): Promise<
  | {
      id: bigint;
      row: AuctionRowNormalized;
    }
  | null
> {
  const mktAddr = process.env
    .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
  const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, publicProvider);

  let id: bigint = 0n;
  try {
    id = await mkt.activeAuctionForToken(args.collection, args.tokenId);
  } catch {}
  if (id === 0n && args.standard === "ERC1155" && args.seller) {
    try {
      id = await mkt.activeAuction1155BySeller(
        args.collection,
        args.tokenId,
        args.seller
      );
    } catch {}
  }
  if (id === 0n) return null;

  const raw = (await mkt.auctions(id)) as AuctionRowRaw;
  const row = normalizeAuctionRow(raw);
  return { id, row };
}

/* ------------------------------------------------------------------ */
/* By-ID readers (public provider)                                     */
/* ------------------------------------------------------------------ */
export async function readListingById(
  listingId: bigint
): Promise<{ id: bigint; row: ListingRowNormalized } | null> {
  const mktAddr = process.env
    .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
  const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, publicProvider);
  try {
    const raw = (await mkt.listings(listingId)) as ListingRowRaw;
    if (!raw) return null;
    // Optional sanity: treat all-zero rows as missing
    if (raw.seller === ZERO_ADDRESS && raw.price === 0n) return null;
    return { id: listingId, row: normalizeListingRow(raw) };
  } catch {
    return null;
  }
}

export async function readAuctionById(
  auctionId: bigint
): Promise<{ id: bigint; row: AuctionRowNormalized } | null> {
  const mktAddr = process.env
    .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
  const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, publicProvider);
  try {
    const raw = (await mkt.auctions(auctionId)) as AuctionRowRaw;
    if (!raw) return null;
    if (raw.seller === ZERO_ADDRESS && raw.startPrice === 0n) return null;
    return { id: auctionId, row: normalizeAuctionRow(raw) };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Cancel actions                                                      */
/* ------------------------------------------------------------------ */
export async function cancelListingOnChain(listingId: bigint) {
  const { signer } = await getBrowserSigner();
  const mktAddr = process.env
    .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
  const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);
  const tx = await mkt.cancelListing(listingId);
  const rc = await tx.wait();
  return { txHash: rc?.hash ?? tx.hash };
}

export async function cancelAuctionOnChain(auctionId: bigint) {
  const { signer } = await getBrowserSigner();
  const mktAddr = process.env
    .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
  const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);
  const tx = await mkt.cancelAuction(auctionId);
  const rc = await tx.wait();
  return { txHash: rc?.hash ?? tx.hash };
}
