// lib/types.ts
import { StaticImageData } from "next/image";

/* ============================================================================
 * Core NFT types
 * ========================================================================= */

/**
 * A single on-chain NFT item with normalized fields for the UI.
 * NOTES:
 * - `standard` is narrowed to "ERC721" | "ERC1155".
 * - `image` can be a URL or a Next StaticImageData.
 * - `collectionId` may be undefined for Single-721 and ERC-1155 contracts.
 * - Addresses are preserved in their original checksum casing; do not lowercase.
 */
export interface NFTItem {
  id: string;

  /** Checksum-cased contract address for UI links */
  nftAddress: string;

  tokenId: string;
  name: string;
  image: string | StaticImageData;
  description?: string;
  traits?: Record<string, any>;
  attributes?: Record<string, any>;
  tokenUri?: string;
  metadataHash?: string;

  /** Checksum-cased contract address (same as nftAddress) */
  contract: string;

  /** Token standard (narrowed) */
  standard?: "ERC721" | "ERC1155";

  royaltyBps?: number;                 // basis points (500 = 5%)
  royaltyRecipient?: string | null;
  ownerId?: string;
  collectionId?: string;

  // Listing / marketplace state
  isListed: boolean;
  /** Lowest active fixed-price listing (ETN, already normalized) */
  listingPrice?: number | null;
  isAuctioned: boolean;

  // Basic analytics
  viewCount: number;
  favoriteCount: number;

  // Timestamps as ISO strings
  createdAt: string;
  updatedAt: string;
}

/* ============================================================================
 * ERC-1155 Holdings (ADDED)
 * Use this to show balances next to items in the UI. Each entry carries the
 * already-shaped NFT plus the user's balance for that (contract, tokenId).
 * ========================================================================= */
export interface ERC1155HoldingView {
  balance: number | string; // numeric string accepted from API
  updatedAt: string;        // ISO timestamp
  nft: NFTItem;             // should have standard="ERC1155"
}

/* ============================================================================
 * Display Group
 * A frontend-facing abstraction so the UI can treat both real Collections and
 * virtual “Contract groups” uniformly (when collectionId is NULL).
 * ========================================================================= */
export interface DisplayGroup {
  /** "collection" when there is a real Collection row; "contract" otherwise */
  type: "collection" | "contract";

  /** Collection id (for type=collection) OR checksum contract address (for type=contract) */
  id: string;

  /** Slug or checksum contract address for URL construction */
  slug: string;

  /** Human-friendly title: Collection name, or Contract name/symbol/fallback */
  title: string;

  /** Group’s token standard, for badges/UX */
  standard: "ERC721" | "ERC1155";

  /** Optional extras for headers */
  itemCount?: number;
  coverImage?: string | null;
  owner?: string | null;
}

/* ============================================================================
 * Collections
 * ========================================================================= */
export interface Collection {
  id: string | number;
  name: string;
  symbol: string;
  contract: string;
  description: string;
  logoUrl: string | null;
  coverUrl: string | null;
  supply: number | null;
  royaltyBps: number | null;
  royaltyRecipient: string | null;
  x: string;
  instagram: string;
  website: string;
  discord: string;
  telegram: string;
  email: string;
  floorPrice: number;
  volume: number;
  itemsCount: number;
  ownersCount: number;
  change24h: number;
  creatorId: string;
  ownerAddress: string;
  createdAt: string;
  updatedAt: string;

  creator: {
    walletAddress: string;
    username: string;
    profileAvatar: string;
  };

  dropDetails: any | null;

  nfts: {
    id: string;
    imageUrl: string;
    isListed: boolean;
    listingPrice: number | null;
  }[];
}

export type CollectionWithNFTs = Omit<Collection, "nfts" | "creator"> & {
  creator: {
    walletAddress: string;
    username: string | null;
    profileAvatar: string | null;
  };
  nfts: (Omit<
    NFTItem,
    "nftAddress" | "image" | "isAuctioned" | "isListed" | "listingPrice"
  > & {
    imageUrl: string;
    listingPrice: number | null;
  })[];
};

/* ============================================================================
 * Activities
 * ========================================================================= */
export interface NFTActivity {
  id: string;
  nftId: string;
  contract: string;
  tokenId: string;
  type: string;
  fromAddress: string;
  toAddress: string;
  price: string | null;  // keep string to avoid precision issues
  txHash: string;
  blockNumber: number;
  timestamp: Date;       // your API currently returns Date; keep as-is
  marketplace?: string;
  rawData?: any;
  createdAt: Date;
}

/* ============================================================================
 * Users
 * ========================================================================= */
export interface UserProfile {
  walletAddress: string;
  username: string;
  profileAvatar: string;
  profileBanner: string | null;

  instagram?: string;
  x?: string;
  website?: string;
  telegram?: string;
  /** All ERC721 and any NFTs stored with ownerId */
  ownedNFTs: NFTItem[];

  /** ERC1155 balances merged into the UI (each entry includes the NFT and balance) */
  erc1155Holdings?: ERC1155HoldingView[];
}

/* ============================================================================
 * Ancillary UI types
 * ========================================================================= */
export type ExploreCollection = {
  rank: number;
  collectionImg: StaticImageData;
  collectionName: string;
  floorPrice: number | null;
  floorChange: string | null;
  volume: number | null;
  volumeChange: string | null;
  items: number;
  owners: number;
  collectionItems?: Collection[];
};

export interface TopUserItem {
  name: string;
  coverImg: StaticImageData;
  profileImg: StaticImageData;
  href: string;
}

export type MintingCollection = {
  tokenId: string;
  name: string;
  image: string | StaticImageData;
  total: number;
  minted: number;
  href: string;
};

/* ============================================================================
 * Optional: Raw Metadata helper type
 * ========================================================================= */

/** Raw on-chain/off-chain metadata object stored per NFT */
export type RawMetadata = Record<string, unknown>;
