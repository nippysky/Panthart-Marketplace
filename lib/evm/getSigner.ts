"use client";
import { ethers } from "ethers";

export async function getBrowserSigner() {
  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error("No injected wallet found. Open your wallet or use ConnectWallet.");
  }
  const provider = new ethers.BrowserProvider((window as any).ethereum, "any");
  const network = await provider.getNetwork();
  const signer = await provider.getSigner();
  return { provider, signer, chainId: Number(network.chainId) };
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
