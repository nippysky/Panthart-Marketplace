// lib/evm/ws.ts
import { ethers } from "ethers";

const WSS =
  process.env.NEXT_PUBLIC_WSS_RPC_URL ||
  process.env.WSS_RPC_URL ||
  "";

export function getWsProvider() {
  if (!WSS) return null;
  try {
    const p = new ethers.WebSocketProvider(WSS);
    return p;
  } catch {
    return null;
  }
}
