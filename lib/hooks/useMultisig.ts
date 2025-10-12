"use client";

import * as React from "react";
import { http, createPublicClient } from "viem";
import { getAddress, isAddress } from "viem";
import { MULTI_SIG_ABI } from "../contracts/multisig";

// env
const MULTI_SIG_ADDRESS = (process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS || "") as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";

export type UseMultisigOpts = { take?: number };

export function useMultisig(opts: UseMultisigOpts = {}) {
  const take = Math.max(1, Math.min(opts.take ?? 20, 100));

  const [address] = React.useState<`0x${string}` | null>(() =>
    isAddress(MULTI_SIG_ADDRESS) ? (getAddress(MULTI_SIG_ADDRESS) as `0x${string}`) : null
  );
  const [chainId, setChainId] = React.useState<number | null>(null);
  const [owners, setOwners] = React.useState<`0x${string}`[]>([]);
  const [required, setRequired] = React.useState<number>(0);
  const [balanceWei, setBalanceWei] = React.useState<bigint>(0n);
  const [txs, setTxs] = React.useState<
    {
      index: number;
      to: `0x${string}`;
      tokenAddress: `0x${string}`;
      valueWei: bigint;
      executed: boolean;
      confirmations: number;
      required: number;
      data: `0x${string}` | "0x";
    }[]
  >([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const client = React.useMemo(() => {
    if (!RPC_URL) return null;
    return createPublicClient({ transport: http(RPC_URL) });
  }, []);

  const load = React.useCallback(async () => {
    if (!address) {
      setError("NEXT_PUBLIC_MULTI_SIG_ADDRESS is missing or invalid.");
      return;
    }
    if (!client) {
      setError("NEXT_PUBLIC_RPC_URL is missing. Set a valid RPC URL for your chain.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [cid, bal, ownerList, req, count] = await Promise.all([
        client.getChainId(),
        client.getBalance({ address }),
        client.readContract({
          address,
          abi: MULTI_SIG_ABI as any,
          functionName: "getOwners",
          args: [],
        }) as Promise<`0x${string}`[]>,
        client.readContract({
          address,
          abi: MULTI_SIG_ABI as any,
          functionName: "required",
          args: [],
        }) as Promise<bigint>,
        client.readContract({
          address,
          abi: MULTI_SIG_ABI as any,
          functionName: "getTransactionCount",
          args: [],
        }) as Promise<bigint>,
      ]);

      setChainId(cid);
      setBalanceWei(bal);
      setOwners(ownerList.map((o) => getAddress(o) as `0x${string}`));
      setRequired(Number(req));

      const total = Number(count);
      if (total === 0) {
        setTxs([]);
        setLoading(false);
        return;
      }

      const start = Math.max(0, total - take);
      const indexes = Array.from({ length: total - start }, (_, i) => start + i);

      // Prepare multicall contracts
      const calls = indexes.map((i) => ({
        address,
        abi: MULTI_SIG_ABI as any,
        functionName: "getTransaction" as const,
        args: [BigInt(i)],
      }));

      type TxResult = {
        tokenAddress: `0x${string}`;
        to: `0x${string}`;
        value: bigint;
        executed: boolean;
        confirmationsCount: bigint;
        data: `0x${string}` | "0x";
      };

      let results: TxResult[] = [];

      try {
        const multi = await client.multicall({ contracts: calls as any, allowFailure: true });
        results = multi.map((r) => {
          if (!r.result) throw new Error("call failed");
          const [tokenAddress, to, value, executed, confirmationsCount, data] = r.result as any;
          return { tokenAddress, to, value, executed, confirmationsCount, data };
        });
      } catch {
        // fallback to serial reads
        results = [];
        for (const i of indexes) {
          const [tokenAddress, to, value, executed, confirmationsCount, data] = (await client.readContract({
            address,
            abi: MULTI_SIG_ABI as any,
            functionName: "getTransaction",
            args: [BigInt(i)],
          })) as any;
          results.push({ tokenAddress, to, value, executed, confirmationsCount, data });
        }
      }

      setTxs(
        results
          .map((r, k) => ({
            index: indexes[k],
            to: getAddress(r.to) as `0x${string}`,
            tokenAddress: getAddress(r.tokenAddress) as `0x${string}`,
            valueWei: r.value as bigint,
            executed: Boolean(r.executed),
            confirmations: Number(r.confirmationsCount),
            required: Number(req),
            data: (r.data || "0x") as `0x${string}` | "0x",
          }))
          .reverse()
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [address, client, take]);

  // NEW: check whether a specific owner has already confirmed a tx
  const hasConfirmed = React.useCallback(
    async (txIndex: number, owner?: `0x${string}` | undefined) => {
      if (!client || !address || !owner) return false;
      try {
        const ok = (await client.readContract({
          address,
          abi: MULTI_SIG_ABI as any,
          functionName: "isConfirmed",
          args: [BigInt(txIndex), owner],
        })) as boolean;
        return Boolean(ok);
      } catch {
        return false;
      }
    },
    [address, client]
  );

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    address,
    chainId,
    owners,
    required,
    balanceWei,
    txs,
    loading,
    error,
    refresh: load,
    hasConfirmed, // <— expose
  };
}
