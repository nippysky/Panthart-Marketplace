"use client";

import * as React from "react";
import { http, createPublicClient } from "viem";
import { getAddress, isAddress } from "viem";
import { STOLEN_REGISTRY_ABI } from "@/lib/abis/marketplace-core/stolenRegistryABI";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
const STOLEN_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_STOLEN_REGISTRY_ADDRESS || "") as `0x${string}`;

export function useStolenRegistryAdmin() {
  const [address] = React.useState<`0x${string}` | null>(() =>
    isAddress(STOLEN_REGISTRY_ADDRESS) ? (getAddress(STOLEN_REGISTRY_ADDRESS) as `0x${string}`) : null
  );

  const [chainId, setChainId] = React.useState<number | null>(null);
  const [paused, setPaused] = React.useState<boolean>(false);
  const [REPORTER_ROLE, setREPORTER_ROLE] = React.useState<`0x${string}` | null>(null);
  const [CLEARER_ROLE, setCLEARER_ROLE] = React.useState<`0x${string}` | null>(null);
  const [DEFAULT_ADMIN_ROLE, setDEFAULT_ADMIN_ROLE] = React.useState<`0x${string}` | null>(null);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const client = React.useMemo(() => (RPC_URL ? createPublicClient({ transport: http(RPC_URL) }) : null), []);

  const hasRole = React.useCallback(
    async (role: `0x${string}`, account: `0x${string}`) => {
      if (!client || !address) return false;
      try {
        const ok = (await client.readContract({
          address,
          abi: STOLEN_REGISTRY_ABI as any,
          functionName: "hasRole",
          args: [role, account],
        })) as boolean;
        return !!ok;
      } catch {
        return false;
      }
    },
    [address, client]
  );

  const load = React.useCallback(async () => {
    if (!address) {
      setError("NEXT_PUBLIC_STOLEN_REGISTRY_ADDRESS is missing or invalid.");
      return;
    }
    if (!client) {
      setError("NEXT_PUBLIC_RPC_URL is missing. Set a valid RPC URL for your chain.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [cid, isPaused, reporter, clearer, admin] = await Promise.all([
        client.getChainId(),
        client.readContract({ address, abi: STOLEN_REGISTRY_ABI as any, functionName: "paused", args: [] }) as Promise<boolean>,
        client.readContract({ address, abi: STOLEN_REGISTRY_ABI as any, functionName: "REPORTER_ROLE", args: [] }) as Promise<`0x${string}`>,
        client.readContract({ address, abi: STOLEN_REGISTRY_ABI as any, functionName: "CLEARER_ROLE", args: [] }) as Promise<`0x${string}`>,
        client.readContract({ address, abi: STOLEN_REGISTRY_ABI as any, functionName: "DEFAULT_ADMIN_ROLE", args: [] }) as Promise<`0x${string}`>,
      ]);
      setChainId(cid);
      setPaused(isPaused);
      setREPORTER_ROLE(reporter);
      setCLEARER_ROLE(clearer);
      setDEFAULT_ADMIN_ROLE(admin);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [address, client]);

  React.useEffect(() => {
    load();
  }, [load]);

  return {
    address,
    chainId,
    paused,
    REPORTER_ROLE,
    CLEARER_ROLE,
    DEFAULT_ADMIN_ROLE,
    hasRole,
    loading,
    error,
    refresh: load,
  };
}
