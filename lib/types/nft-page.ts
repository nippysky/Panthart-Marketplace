// lib/types/nft-page.ts
export type Profile = {
  walletAddress: string;
  username?: string | null;
  imageUrl?: string | null;
};

export type DisplayGroup = {
  type: "collection" | "contract";
  id: string;
  slug: string;
  title: string;
  standard: "ERC721" | "ERC1155";
  itemCount?: number;
  coverImage?: string | null;
  owner?: string | null;
};

export type AuctionInfo = {
  active: boolean;
  auction?: {
    highestBid?: number | null;
    startPrice?: number | null;
    endTime?: string | null; // ISO
  } | null;
};
