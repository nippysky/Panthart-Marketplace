import { defineChain } from 'viem';

export const electroneum = defineChain({
  id: 52014,
  name: 'Electroneum Mainnet',
  network: 'electroneum',
  nativeCurrency: { name: 'Electroneum', symbol: 'ETN', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.RPC_URL || 'https://rpc.electroneum.com'] },
    public:  { http: [process.env.RPC_URL || 'https://rpc.electroneum.com'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://blockexplorer.electroneum.com' },
  },
});
