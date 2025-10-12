// lib/web3/publicClient.ts
import { createPublicClient, http } from "viem";

// Keep the chain generic; RPC comes from env.
const RPC = process.env.NEXT_PUBLIC_RPC_URL;

export const publicClient = createPublicClient({
  transport: http(RPC),
  // If you later want chain metadata for formatting, you can add a custom chain object here.
});
