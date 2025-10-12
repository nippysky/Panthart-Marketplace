// lib/abis/erc20.ts
export const ERC20_ABI = [
  { "constant": true, "inputs": [], "name": "name", "outputs":[{"name":"","type":"string"}], "stateMutability":"view", "type":"function" },
  { "constant": true, "inputs": [], "name": "symbol", "outputs":[{"name":"","type":"string"}], "stateMutability":"view", "type":"function" },
  { "constant": true, "inputs": [], "name": "decimals", "outputs":[{"name":"","type":"uint8"}], "stateMutability":"view", "type":"function" },
  { "constant": true, "inputs": [{"name":"owner","type":"address"}], "name": "balanceOf", "outputs":[{"name":"","type":"uint256"}], "stateMutability":"view", "type":"function" }
] as const;
