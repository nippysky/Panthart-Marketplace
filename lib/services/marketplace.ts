// lib/services/marketplace.ts
import { ethers } from "ethers";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";
import { getBrowserSigner, ZERO_ADDRESS } from "@/lib/evm/getSigner";
import {
  readActiveListing as readActiveListingCore,
  readActiveAuction as readActiveAuctionCore,
  createListingOnChain as createListingCore,
  createAuctionOnChain as createAuctionCore,
  cancelListingOnChain as cancelListingCore,
  cancelAuctionOnChain as cancelAuctionCore,
  getErc20Meta as getErc20MetaCore,
  type Standard as StdForHelper,
} from "@/lib/evm/marketplace-actions";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 52014);

// Public provider for read-only helpers (no wallet dependency)
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.RPC_URL ||
  "https://rpc.ankr.com/electroneum";
const publicProvider = new ethers.JsonRpcProvider(RPC_URL);

async function ensureRightNetwork() {
  const { chainId } = await getBrowserSigner();
  if (Number(chainId) !== CHAIN_ID) {
    throw new Error("Wrong network. Please switch to Electroneum.");
  }
}

function toWeiHuman(amount: string, decimals: number): bigint {
  return ethers.parseUnits((amount || "0").trim(), decimals);
}

export const marketplace = {
  /* ------------------------------------------------------------------ */
  /* Read helpers (existing)                                            */
  /* ------------------------------------------------------------------ */
  readActiveListing: readActiveListingCore,
  readActiveAuction: readActiveAuctionCore,
  getErc20Meta: getErc20MetaCore,

  /* ------------------------------------------------------------------ */
  /* NEW: Seller-scoped readers for ERC1155                             */
  /* ------------------------------------------------------------------ */
  /**
   * Read the active listing for a specific seller (useful for ERC1155 where
   * each seller has their own listing slot).
   */
  async readActiveListingForSeller(args: {
    collection: `0x${string}`;
    tokenId: bigint;
    standard: StdForHelper;
    seller: `0x${string}`;
  }) {
    return readActiveListingCore({
      collection: args.collection,
      tokenId: args.tokenId,
      standard: args.standard,
      seller: args.seller,
    });
  },

  /**
   * Read the active auction for a specific seller (ERC1155 per-seller slot).
   */
  async readActiveAuctionForSeller(args: {
    collection: `0x${string}`;
    tokenId: bigint;
    standard: StdForHelper;
    seller: `0x${string}`;
  }) {
    return readActiveAuctionCore({
      collection: args.collection,
      tokenId: args.tokenId,
      standard: args.standard,
      seller: args.seller,
    });
  },

  /* ------------------------------------------------------------------ */
  /* NEW: By-ID readers (public provider)                               */
  /* ------------------------------------------------------------------ */
  /**
   * Read a listing row by its ID. Normalizes startTime/endTime -> start/end
   * to match UI expectations.
   */
  async readListingById(listingId: bigint) {
    const mktAddr = process.env
      .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
    const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, publicProvider);
    const raw = await mkt.listings(listingId);
    if (!raw) return null;

    const row = {
      seller: raw.seller as `0x${string}`,
      currency: raw.currency as `0x${string}`,
      price: raw.price as bigint,
      quantity: raw.quantity as bigint,
      start: raw.startTime as bigint, // normalize
      end: raw.endTime as bigint,     // normalize
      standard: raw.standard as bigint,
    };

    return { id: listingId, row };
  },

  /**
   * Read an auction row by its ID. Normalizes startTime/endTime -> start/end
   * to match UI expectations.
   */
  async readAuctionById(auctionId: bigint) {
    const mktAddr = process.env
      .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
    const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, publicProvider);
    const raw = await mkt.auctions(auctionId);
    if (!raw) return null;

    const row = {
      seller: raw.seller as `0x${string}`,
      currency: raw.currency as `0x${string}`,
      startPrice: raw.startPrice as bigint,
      minIncrement: raw.minIncrement as bigint,
      start: raw.startTime as bigint, // normalize
      end: raw.endTime as bigint,     // normalize
      highestBidder: raw.highestBidder as `0x${string}`,
      highestBid: raw.highestBid as bigint,
      bidsCount: Number(raw.bidsCount || 0),
      standard: raw.standard as bigint,
      settled: Boolean(raw.settled),
    };

    return { id: auctionId, row };
  },

  /* ------------------------------------------------------------------ */
  /* Create/Cancel (existing)                                           */
  /* ------------------------------------------------------------------ */
  createListing: createListingCore,
  createAuction: createAuctionCore,
  cancelListing: cancelListingCore,
  cancelAuction: cancelAuctionCore,

  /** End an expired listing and return NFT to the seller (anyone can call). */
  async cleanupExpired(listingId: bigint) {
    await ensureRightNetwork();
    const { signer } = await getBrowserSigner();
    const mktAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
    const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);
    const tx = await mkt.cleanupExpiredListing(listingId);
    const rc = await tx.wait();
    return rc?.hash ?? tx.hash;
  },

  /* ------------------------------------------------------------------ */
  /* Buy/Bid/Finalize (existing)                                        */
  /* ------------------------------------------------------------------ */
  /** Buy with just-in-time listing re-read + ERC20 allowance if needed. */
  async buyListingJustInTime(args: {
    collection: `0x${string}`;
    tokenId: bigint;
    standard: StdForHelper;
  }) {
    await ensureRightNetwork();

    const li = await readActiveListingCore(args);
    if (!li) throw new Error("Listing unavailable.");

    const listingId = li.id;
    const currency = li.row.currency as `0x${string}`;
    const price = li.row.price as bigint;

    const { signer } = await getBrowserSigner();
    const mktAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
    const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);

    if (currency && currency !== ZERO_ADDRESS) {
      const erc20 = new ethers.Contract(
        currency,
        [
          "function allowance(address owner, address spender) view returns (uint256)",
          "function approve(address spender, uint256 value) returns (bool)",
        ],
        signer
      );
      const ownerAddr = await signer.getAddress();
      const allowance: bigint = await erc20.allowance(ownerAddr, mktAddr);
      if (allowance < price) {
        const txA = await erc20.approve(mktAddr, price);
        await txA.wait();
      }
      const tx = await mkt.buy(listingId);
      const rc = await tx.wait();
      return rc?.hash ?? tx.hash;
    } else {
      const tx = await mkt.buy(listingId, { value: price });
      const rc = await tx.wait();
      return rc?.hash ?? tx.hash;
    }
  },

  /** Place a bid using current active auction row + currency metadata. */
  async placeBidJustInTime(args: {
    collection: `0x${string}`;
    tokenId: bigint;
    standard: StdForHelper;
    /** Human amount string in the auction's currency (ETN or ERC-20) */
    amountHuman: string;
  }) {
    await ensureRightNetwork();

    // 1) read active auction
    const au = await readActiveAuctionCore({
      collection: args.collection,
      tokenId: args.tokenId,
      standard: args.standard,
    });
    if (!au) throw new Error("Auction unavailable.");

    const auctionId = au.id;
    const currency = au.row.currency as `0x${string}`;

    // 2) resolve decimals
    const decimals =
      currency === ZERO_ADDRESS ? 18 : (await getErc20MetaCore(currency)).decimals;

    const amountWei = toWeiHuman(args.amountHuman, decimals);

    // 3) send tx (approve if ERC-20)
    const { signer } = await getBrowserSigner();
    const mktAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
    const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);

    if (currency !== ZERO_ADDRESS) {
      const erc20 = new ethers.Contract(
        currency,
        [
          "function allowance(address owner, address spender) view returns (uint256)",
          "function approve(address spender, uint256 value) returns (bool)",
        ],
        signer
      );
      const ownerAddr = await signer.getAddress();
      const allowance: bigint = await erc20.allowance(ownerAddr, mktAddr);
      if (allowance < amountWei) {
        const txA = await erc20.approve(mktAddr, amountWei);
        await txA.wait();
      }
      // ERC-20: amount is passed as the 2nd arg, no msg.value
      const tx = await mkt.bid(auctionId, amountWei);
      const rc = await tx.wait();
      return { txHash: rc?.hash ?? tx.hash, auctionId, currency, decimals };
    } else {
      // Native: amount is also passed as the 2nd arg, AND sent as value
      const tx = await mkt.bid(auctionId, amountWei, { value: amountWei });
      const rc = await tx.wait();
      return { txHash: rc?.hash ?? tx.hash, auctionId, currency, decimals };
    }
  },

  /** NEW: finalize an ended auction (anyone can call). */
  async finalizeAuction(auctionId: bigint) {
    await ensureRightNetwork();
    const { signer } = await getBrowserSigner();
    const mktAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
    const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);
    const tx = await mkt.finalize(auctionId);
    const rc = await tx.wait();
    return rc?.hash ?? tx.hash;
  },
};

export type { StdForHelper as Standard };
