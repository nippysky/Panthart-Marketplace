// lib/server/auth.ts
import { headers } from "next/headers";
import { ethers } from "ethers";

/**
 * Reads the connected wallet address from the request headers.
 * Client must set the "x-user-address" header on requests.
 * Returns a checksummed address or null.
 */
export async function getServerSideAuth(): Promise<{ address: string | null }> {
  const hdrs = await headers();
  const raw = (hdrs.get("x-user-address") || "").trim();
  if (!ethers.isAddress(raw)) return { address: null };
  return { address: ethers.getAddress(raw) };
}

/**
 * Convenience helper for routes that must be authenticated.
 * Throws a 401-style error payload you can catch/return.
 */
export async function requireWalletAddress(): Promise<string> {
  const { address } = await getServerSideAuth();
  if (!address) {
    // You can also `throw new Error("Unauthorized")` and map it,
    // but returning a structured object from routes is often cleaner.
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  return address;
}
