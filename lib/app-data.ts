export const PERIOD_OPTIONS = [
    { value: "24H", label: "Last 24 Hours" },
    { value: "7D", label: "Last 7 Days" },
    { value: "1M", label: "Last Month" },
    { value: "1Y", label: "Last Year" },
    { value: "all", label: "All Time" },
  ];
  
  export const PRICE_OPTIONS = [
    { value: "lth", label: "Price low to high" },
    { value: "htl", label: "Price high to low" },
    { value: "rl", label: "Recently listed" },
    { value: "hb", label: "Highest bid" },
  ];

export const CREATE_NFT_OPTIONS = [
  {
    title: "Collection (ERC-721 Drop)",
    desc: "Deploy a collection and mint items yourself now. You can open a public mint later. Best for full creative control.",
    href: "/create/drop",
  },
  {
    title: "Single NFT (ERC-721)",
    desc: "A one-of-a-kind piece. Perfect for unique artworks, photography, and rare collectibles.",
    href: "/create/erc-721",
  },
  {
    title: "Single (ERC-1155)",
    desc: "Mint in quantity with shared metadata. Great for editions, game items, or memberships.",
    href: "/create/erc-1155",
  },
];
