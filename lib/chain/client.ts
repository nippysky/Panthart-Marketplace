// lib/chain/client.ts
import { ethers } from "ethers";

export function getFactoryAddress(): string {
  const addr = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
  if (!addr) throw new Error("NEXT_PUBLIC_FACTORY_ADDRESS is not set");
  return addr;
}

export function getRequiredChainId(): number {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (!raw) throw new Error("NEXT_PUBLIC_CHAIN_ID not set");
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error("NEXT_PUBLIC_CHAIN_ID must be an integer chain id");
  return n;
}

export async function getBrowserSigner(): Promise<ethers.Signer> {
  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error("No injected wallet found. Please install MetaMask or a compatible wallet.");
  }
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  return signer;
}

export async function ensureChain(requiredChainId: number) {
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== Number(requiredChainId)) {
    // Attempt to switch
    await (window as any).ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + requiredChainId.toString(16) }],
    });
  }
}

export function toBytes32(hex: string): string {
  const h = (hex || "").toLowerCase();
  if (!h.startsWith("0x") || h.length !== 66) throw new Error("Invalid bytes32 hex");
  return h;
}

export function percentToBps(p: number): number {
  if (p < 0 || p > 100) throw new Error("percent out of range");
  return Math.round(p * 100);
}
