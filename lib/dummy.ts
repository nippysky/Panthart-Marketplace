
import {
  DUMMY_IMG,
} from "./images";

import { Collection, ExploreCollection, TopUserItem, NFTItem, MintingCollection } from "./types/types";


export const DUMMY_SEARCH_DATA = {
  collections: [
    { name: "Cyber Gorillas", slug: "cyber-gorillas", image: DUMMY_IMG },
    { name: "Pixel Punks", slug: "pixel-punks", image: DUMMY_IMG },
  ],
  nfts: [
    { name: "Pixel Gorilla #102", tokenId: "102", collection: "Cyber Gorillas", image:DUMMY_IMG  },
    { name: "Punk Legend #8", tokenId: "8", collection: "Pixel Punks", image:DUMMY_IMG  },
  ],
  users: [
    { username: "artmaster.eth", wallet: "0x1234...abcd", image: DUMMY_IMG },
    { username: "degenking", wallet: "0x5678...efgh", image: DUMMY_IMG  },
  ],
};


export const FEATURED_TEN: NFTItem[] = Array.from({ length: 10 }, (_, i) => {
  const tokenId = `${i + 1}`;
  const contract = "0xComradeNFT";
  const now = new Date().toISOString();
  // just for demo: make every even token “listed” at price 3 800 × (i+1)
  const listed = (i + 1) % 2 === 0;

  return {
    id: `nft-${tokenId}`,
    nftAddress: contract,
    tokenId,
    name: `NFComrades #${tokenId}`,
    image: typeof DUMMY_IMG === "string" ? DUMMY_IMG : DUMMY_IMG.src,
    description: undefined,
    traits: undefined,
    attributes: undefined,
    tokenUri: undefined,
    metadataHash: undefined,
    contract,
    standard: undefined,
    royaltyBps: undefined,
    royaltyRecipient: undefined,
    ownerId: undefined,
    collectionId: undefined,

    isListed: listed,
    listingPrice: listed ? 3800 * (i + 1) : undefined,
    isAuctioned: false,

    viewCount: 0,
    favoriteCount: 0,

    createdAt: now,
    updatedAt: now,
  };
});


export const DUMMY_COLLECTIONS: Collection[] = Array.from({ length: 10 }, (_, i) => {
  const index = i + 1;
  const collectionName = `Non Fungible Comrades #${index}`;
  const collectionAddress = `0xCOLLECTION${index.toString().padStart(4, "0")}`;
  const owner = `0xDeCentroneumOwner${index.toString().padStart(2, "0")}`;
  const now = new Date().toISOString();

  return {
    id: `dummy-${index}`,
    name: collectionName,
    symbol: `NFC${index}`,
    contract: collectionAddress,
    description: `This is a dummy description for ${collectionName}.`,
    logoUrl: DUMMY_IMG.src, // assuming DUMMY_IMG is a StaticImageData
    coverUrl: DUMMY_IMG.src,
    supply: 10,
    royaltyBps: 500,
    royaltyRecipient: owner,
    x: `https://twitter.com/nfc${index}`,
    instagram: `https://instagram.com/nfc${index}`,
    website: `https://nfc${index}.io`,
    discord: `https://discord.gg/nfc${index}`,
    telegram: `https://t.me/nfc${index}`,
    email: `nfc${index}@example.com`,
    floorPrice: Number((Math.random() * 10).toFixed(2)),
    volume: Number((Math.random() * 1000).toFixed(2)),
    itemsCount: FEATURED_TEN.length,
    ownersCount: Math.floor(Math.random() * 100),
    change24h: Number((Math.random() * 10 - 5).toFixed(2)), // -5 to +5%
    creatorId: `creator-${index}`,
    ownerAddress: owner,
    createdAt: now,
    updatedAt: now,

    creator: {
      walletAddress: owner,
      username: `creator${index}`,
      profileAvatar: DUMMY_IMG.src,
    },

    dropDetails: null,

    nfts: FEATURED_TEN.map((nft, j) => ({
      id: `nft-${index}-${j}`,
  imageUrl: (typeof nft.image === "string" ? nft.image : nft.image.src) || DUMMY_IMG.src,
      isListed: true,
      listingPrice: Number((Math.random() * 5).toFixed(2)),
    })),
  };
});


export const AUCTION_ITEMS: AuctionItem[] = Array.from({ length: 10 }, (_, i) => {
  const now = new Date();
  const end = new Date(now.getTime() + (3 + i) * 60 * 60 * 1000); // 3-12 hours from now
  const start = new Date(now.getTime() - (1 + i) * 60 * 60 * 1000); // started in the past

  return {
    nftAddress: "0xAuctionNFTContract",
    tokenId: `${i + 1}`,
    name: `AuctionComrade #${i + 1}`,
    image: DUMMY_IMG,
    price: `${(i + 1) * 500}`,
    currency: "ETN",
    owner: "0xAuctionMaster",
    collectionName: "Auction Comrades",
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
});


export const MINTING_COLLECTIONS: MintingCollection[] = Array.from({ length: 10 }, (_, i) => {
  const total = [1000, 2000, 5000, 7777, 8888, 9999, 4444, 3333, 6666, 10000][i];
  const minted = Math.floor(total * (0.2 + Math.random() * 0.6)); // 20%-80% minted
  const slug = `collection-${i + 1}`;
  const cleanName = `MintDrop ${2024 + i}`;
  return {
    tokenId: `${i + 1}`,
    name: cleanName,
    image: DUMMY_IMG, 
    total,
    minted,
    href: `/minting-now/${slug}`,
  };
});



export const COLLECTION_ACTIVITIES = [
  {
    id: 1,
    type: "Listings",
    title: "NFC #1205",
    user: "0xa1c3ba712...de61",
    price: "2.659 ETH",
    time: "12 minutes ago",
    image: DUMMY_IMG,
  },
  {
    id: 2,
    type: "Sales",
    title: "NFC #4825",
    user: "Pablomaque99",
    price: "2.63 ETH",
    time: "13 minutes ago",
    image: DUMMY_IMG,
  },
  {
    id: 3,
    type: "Listings",
    title: "NFC #745",
    user: "0x337abb5bd...aa19",
    price: "2.63 ETH",
    time: "15 minutes ago",
    image: DUMMY_IMG,
  },
];

export const EXPLORE_COLLECTIONS: ExploreCollection[] = [
  {
    rank: 1,
    collectionImg: DUMMY_IMG,
    collectionName: "Non Fungible Comrades",
    floorPrice: 12.5,
    floorChange: "+23%",
    volume: 2500,
    volumeChange: "+5%",
    items: 5000,
    owners: 2567,
    collectionItems: DUMMY_COLLECTIONS,
  },
  {
    rank: 2,
    collectionImg: DUMMY_IMG,
    collectionName: "Collection 2",
    floorPrice: 15.8,
    floorChange: "+10%",
    volume: 3100,
    volumeChange: "+3%",
    items: 6000,
    owners: 3000,
    collectionItems: DUMMY_COLLECTIONS,
  },
  {
    rank: 3,
    collectionImg: DUMMY_IMG,
    collectionName: "Collection 3",
    floorPrice: null,
    floorChange: "-12%",
    volume: 1800,
    volumeChange: "-8%",
    items: 4500,
    owners: 2000,
    collectionItems: DUMMY_COLLECTIONS,
  },
  {
    rank: 4,
    collectionImg: DUMMY_IMG,
    collectionName: "Collection 4",
    floorPrice: 20.0,
    floorChange: null,
    volume: 5000,
    volumeChange: "+20%",
    items: 8000,
    owners: 400,
    collectionItems: DUMMY_COLLECTIONS,
  },
  {
    rank: 5,
    collectionImg: DUMMY_IMG,
    collectionName: "Collection 5",
    floorPrice: 7.2,
    floorChange: "-5%",
    volume: 2200,
    volumeChange: "+2%",
    items: 4000,
    owners: 1500,
    collectionItems: DUMMY_COLLECTIONS,
  },
  {
    rank: 6,
    collectionImg: DUMMY_IMG,
    collectionName: "Collection 6",
    floorPrice: 25.3,
    floorChange: "+15%",
    volume: 7000,
    volumeChange: null,
    items: 10000,
    owners: 5000,
    collectionItems: DUMMY_COLLECTIONS,
  },
  {
    rank: 7,
    collectionImg: DUMMY_IMG,
    collectionName: "Collection 7",
    floorPrice: 18.9,
    floorChange: "-8%",
    volume: 3500,
    volumeChange: "-4%",
    items: 7500,
    owners: 3200,
    collectionItems: DUMMY_COLLECTIONS,
  },
  {
    rank: 8,
    collectionImg: DUMMY_IMG,
    collectionName: "Collection 8",
    floorPrice: 10.1,
    floorChange: "+5%",
    volume: 2700,
    volumeChange: "+1%",
    items: 5200,
    owners: 2400,
    collectionItems: DUMMY_COLLECTIONS,
  },
  {
    rank: 9,
    collectionImg: DUMMY_IMG,
    collectionName: "Collection 9",
    floorPrice: 13.7,
    floorChange: "+18%",
    volume: 4100,
    volumeChange: "+12%",
    items: 6500,
    owners: 2900,
    collectionItems: DUMMY_COLLECTIONS,
  },
  {
    rank: 10,
    collectionImg: DUMMY_IMG,
    collectionName: "Collection 10",
    floorPrice: 22.0,
    floorChange: "-10%",
    volume: 6000,
    volumeChange: "-3%",
    items: 9000,
    owners: 4500,
    collectionItems: DUMMY_COLLECTIONS,
  },
];



export const TOP_USERS: TopUserItem[] = [
  {
    name: "JohnDoe",
    coverImg: DUMMY_IMG,    profileImg: DUMMY_IMG,
    href: "/user-profile/john-doe",
  },
  {
    name: "JaneSmith",
    coverImg: DUMMY_IMG,    profileImg: DUMMY_IMG,
    href: "/user-profile/jane-smith",
  },
  {
    name: "DavidLee",
    coverImg: DUMMY_IMG,    profileImg: DUMMY_IMG,
    href: "/user-profile/david-lee",
  },
  {
    name: "SarahWilson",
    coverImg: DUMMY_IMG,    profileImg: DUMMY_IMG,
    href: "/user-profile/sarah-wilson",
  },
  {
    name: "MichaelBrown",
    coverImg: DUMMY_IMG,    profileImg:  DUMMY_IMG,
    href: "/user-profile/michael-brown",
  },
  {
    name: "EmilyDavis",
    coverImg: DUMMY_IMG,    profileImg: DUMMY_IMG,
    href: "/user-profile/emily-davis",
  },
  {
    name: "DanielJohnson",
    coverImg: DUMMY_IMG,    profileImg: DUMMY_IMG,
    href: "/user-profile/daniel-johnson",
  },
  {
    name: "OliviaTaylor",
    coverImg: DUMMY_IMG,    profileImg:  DUMMY_IMG,
    href: "/user-profile/olivia-taylor",
  },
  {
    name: "JamesAnderson",
    coverImg: DUMMY_IMG,    profileImg: DUMMY_IMG,
    href: "/user-profile/james-anderson",
  },
  {
    name: "ChloeMiller",
    coverImg: DUMMY_IMG,    profileImg: DUMMY_IMG,
    href: "/user-profile/chloe-miller",
  },
];