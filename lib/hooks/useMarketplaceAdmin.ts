"use client";

import * as React from "react";
import { http, createPublicClient } from "viem";
import { getAddress, isAddress } from "viem";
import { MARKETPLACE_CORE_ABI } from "../abis/marketplace-core/marketPlaceCoreABI";


// ENVs
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
const MARKETPLACE_CORE_ADDRESS = (process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS ||
  process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || // fallback if you kept an older name
  "") as `0x${string}`;
const REWARD_DISTRIBUTOR_ADDRESS = (process.env.NEXT_PUBLIC_REWARD_DISTRIBUTOR_ADDRESS ||
  "") as `0x${string}`;

// NOTE: ETN native = zero address key for currencyAllowed
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function useMarketplaceAdmin() {
  const [address] = React.useState<`0x${string}` | null>(() =>
    isAddress(MARKETPLACE_CORE_ADDRESS) ? (getAddress(MARKETPLACE_CORE_ADDRESS) as `0x${string}`) : null
  );

  const [chainId, setChainId] = React.useState<number | null>(null);
  const [feeBps, setFeeBps] = React.useState<bigint>(0n);
  const [distributorShareBps, setDistributorShareBps] = React.useState<bigint>(0n);
  const [feeRecipient, setFeeRecipient] = React.useState<`0x${string}` | null>(null);
  const [rewardsDistributor, setRewardsDistributor] = React.useState<`0x${string}` | null>(null);
  const [stolenRegistry, setStolenRegistry] = React.useState<`0x${string}` | null>(null);
  const [snipeExtension, setSnipeExtension] = React.useState<bigint>(0n);
  const [paused, setPaused] = React.useState<boolean>(false);
  const [etnAllowed, setEtnAllowed] = React.useState<boolean>(true);

  const [CONFIG_ROLE, setCONFIG_ROLE] = React.useState<`0x${string}` | null>(null);
  const [PAUSER_ROLE, setPAUSER_ROLE] = React.useState<`0x${string}` | null>(null);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const client = React.useMemo(() => {
    if (!RPC_URL) return null;
    return createPublicClient({ transport: http(RPC_URL) });
  }, []);

  const load = React.useCallback(async () => {
    if (!address) {
      setError("NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS is missing or invalid.");
      return;
    }
    if (!client) {
      setError("NEXT_PUBLIC_RPC_URL is missing. Set a valid RPC URL for your chain.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        cid,
        fee,
        distShare,
        feeRec,
        distAddr,
        stolenReg,
        snExt,
        isPaused,
        configRole,
        pauserRole,
        etnIsAllowed,
      ] = await Promise.all([
        client.getChainId(),
        client.readContract({ address, abi: MARKETPLACE_CORE_ABI as any, functionName: "feeBps", args: [] }) as Promise<bigint>,
        client.readContract({ address, abi: MARKETPLACE_CORE_ABI as any, functionName: "distributorShareBps", args: [] }) as Promise<bigint>,
        client.readContract({ address, abi: MARKETPLACE_CORE_ABI as any, functionName: "feeRecipient", args: [] }) as Promise<`0x${string}`>,
        client.readContract({ address, abi: MARKETPLACE_CORE_ABI as any, functionName: "rewardsDistributor", args: [] }) as Promise<`0x${string}`>,
        client.readContract({ address, abi: MARKETPLACE_CORE_ABI as any, functionName: "stolenRegistry", args: [] }) as Promise<`0x${string}`>,
        client.readContract({ address, abi: MARKETPLACE_CORE_ABI as any, functionName: "snipeExtension", args: [] }) as Promise<bigint>,
        client.readContract({ address, abi: MARKETPLACE_CORE_ABI as any, functionName: "paused", args: [] }) as Promise<boolean>,
        client.readContract({ address, abi: MARKETPLACE_CORE_ABI as any, functionName: "CONFIG_ROLE", args: [] }) as Promise<`0x${string}`>,
        client.readContract({ address, abi: MARKETPLACE_CORE_ABI as any, functionName: "PAUSER_ROLE", args: [] }) as Promise<`0x${string}`>,
        client.readContract({
          address,
          abi: MARKETPLACE_CORE_ABI as any,
          functionName: "currencyAllowed",
          args: [ZERO_ADDRESS],
        }) as Promise<boolean>,
      ]);

      setChainId(cid);
      setFeeBps(fee);
      setDistributorShareBps(distShare);
      setFeeRecipient(getAddress(feeRec));
      setRewardsDistributor(getAddress(distAddr));
      setStolenRegistry(getAddress(stolenReg));
      setSnipeExtension(snExt);
      setPaused(isPaused);
      setCONFIG_ROLE(configRole);
      setPAUSER_ROLE(pauserRole);
      setEtnAllowed(etnIsAllowed);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [address, client]);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    address,
    chainId,
    feeBps,
    distributorShareBps,
    feeRecipient,
    rewardsDistributor,
    stolenRegistry,
    snipeExtension,
    paused,
    etnAllowed,
    CONFIG_ROLE,
    PAUSER_ROLE,
    REWARD_DISTRIBUTOR_ADDRESS,
    loading,
    error,
    refresh: load,
  };
}
