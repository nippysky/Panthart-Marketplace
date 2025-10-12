export const NFT_ABI = [
  // ERC-721 core
  {
    constant: true,
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    name: "tokenOfOwnerByIndex",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },

  // ERC-1155 core balance
  {
    constant: true,
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },

  // ERC-1155 metadata URI
  {
    constant: true,
    inputs: [{ name: "id", type: "uint256" }],
    name: "uri",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },

  // Optional collection metadata
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "baseURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },

  // EIP-2981 royalty info
  {
    constant: true,
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "salePrice", type: "uint256" },
    ],
    name: "royaltyInfo",
    outputs: [
      { name: "receiver", type: "address" },
      { name: "royaltyAmount", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },

  // Optional OpenSea-style contract URI
  {
    constant: true,
    inputs: [],
    name: "contractURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },

  // Events for parsing logs
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "from",    type: "address" },
      { indexed: true,  name: "to",      type: "address" },
      { indexed: true,  name: "tokenId", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "operator", type: "address" },
      { indexed: true,  name: "from",     type: "address" },
      { indexed: true,  name: "to",       type: "address" },
      { indexed: false, name: "id",       type: "uint256" },
      { indexed: false, name: "value",    type: "uint256" },
    ],
    name: "TransferSingle",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "operator", type: "address" },
      { indexed: true,  name: "from",     type: "address" },
      { indexed: true,  name: "to",       type: "address" },
      { indexed: false, name: "ids",      type: "uint256[]" },
      { indexed: false, name: "values",   type: "uint256[]" },
    ],
    name: "TransferBatch",
    type: "event",
  },
];
