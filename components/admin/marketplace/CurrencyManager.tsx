"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AddressChip from "@/components/common/AddressChip";
import { toast } from "sonner";
import { createPublicClient, getAddress, http } from "viem";
import { ethers } from "ethers";
import { getBrowserSigner, ZERO_ADDRESS } from "@/lib/evm/getSigner";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
const MARKETPLACE = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
const MULTISIG = process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS as `0x${string}`;
const EXPLORER = process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL || "";

type DbCurrency = {
  id: string;
  symbol: string;
  decimals: number;
  kind: "NATIVE" | "ERC20";
  tokenAddress: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function CurrencyManager({ allowedWallets }: { allowedWallets: string[] }) {
  const [list, setList] = React.useState<DbCurrency[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [newAddr, setNewAddr] = React.useState("");
  const [busyToken, setBusyToken] = React.useState<string | null>(null);

  // on-chain allow flags (keyed by lowercase address, ZERO for native)
  const [allowedMap, setAllowedMap] = React.useState<Record<string, boolean>>({});

  const client = React.useMemo(() => {
    if (!RPC_URL) return null;
    return createPublicClient({ transport: http(RPC_URL) });
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/governance/currencies").then((r) => r.json());
      if (res?.ok) setList(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // helper to refresh allowedMap (native + current ERC20s)
  const refreshAllowed = React.useCallback(async () => {
    try {
      if (!client || !MARKETPLACE) return;
      const items = list.filter((c) => c.kind === "ERC20" && c.tokenAddress) as DbCurrency[];

      const targets = [
        { key: ZERO_ADDRESS.toLowerCase(), addr: ZERO_ADDRESS as `0x${string}` },
        ...items.map((c) => ({
          key: c.tokenAddress!.toLowerCase(),
          addr: c.tokenAddress! as `0x${string}`,
        })),
      ];

      const next: Record<string, boolean> = {};
      for (const t of targets) {
        try {
          const ok = (await client.readContract({
            address: MARKETPLACE,
            abi: MARKETPLACE_CORE_ABI as any,
            functionName: "currencyAllowed",
            args: [t.addr],
          })) as boolean;
          next[t.key] = !!ok;
        } catch {
          next[t.key] = false;
        }
      }
      setAllowedMap(next);
    } catch (e) {
      console.error(e);
    }
  }, [client, list]);

  React.useEffect(() => {
    load();
  }, [load]);

  // when list changes, re-check allowed
  React.useEffect(() => {
    refreshAllowed();
  }, [refreshAllowed]);

  const onAdd = async () => {
    try {
      const tokenAddress = getAddress(newAddr);
      const res = await fetch("/api/governance/currencies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenAddress }),
      }).then((r) => r.json());

      if (!res.ok) throw new Error(res.error || "Add failed");
      toast.success(`Added ${res.data.symbol} (${res.data.decimals} decimals)`);
      setNewAddr("");
      await load();
      await refreshAllowed();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  // propose allow/disallow for a token (including native 0x0)
  const proposeToggle = async (token: `0x${string}`, allowed: boolean) => {
    try {
      if (!MARKETPLACE || !MULTISIG) throw new Error("Missing env addresses.");
      const { signer, chainId } = await getBrowserSigner();
      const wallet = (await signer.getAddress()).toLowerCase();
      if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
        throw new Error("This wallet is not in the allowed admin list.");
      }
      if (chainId !== 52014) throw new Error("Wrong network. Switch to Chain ID 52014.");

      setBusyToken(`${token}-${allowed ? "allow" : "disallow"}`);

      const iface = new ethers.Interface(MARKETPLACE_CORE_ABI as any);
      const data = iface.encodeFunctionData("setCurrencyAllowed", [token, allowed]);

      // keep the tiny ABI you used originally to avoid churn
      const multisig = new ethers.Contract(
        MULTISIG,
        [
          {
            inputs: [
              { internalType: "address", name: "tokenAddress", type: "address" },
              { internalType: "address", name: "to", type: "address" },
              { internalType: "uint256", name: "value", type: "uint256" },
              { internalType: "bytes", name: "data", type: "bytes" },
            ],
            name: "submitAndConfirm",
            outputs: [{ internalType: "uint256", name: "txIndex", type: "uint256" }],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        signer
      );

      const txResp = await multisig.submitAndConfirm(ZERO_ADDRESS, MARKETPLACE, 0n, data);
      toast.message("Submitting multisig proposal…");
      await txResp.wait();
      toast.success("Proposal submitted. Confirm in Transactions.");

      await refreshAllowed();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusyToken(null);
    }
  };

  const nativeAllowed = allowedMap[ZERO_ADDRESS.toLowerCase()] ?? false;

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium mb-4">Currencies</h3>

      {/* Add token */}
      <div className="space-y-2 max-w-xl">
        <label className="text-sm text-muted-foreground">Add ERC-20 by address</label>
        <div className="flex gap-2">
          <Input
            placeholder="0x…"
            value={newAddr}
            onChange={(e) => setNewAddr(e.target.value)}
            className="flex-1"
          />
          <Button onClick={onAdd} disabled={!newAddr.trim()}>
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Symbol &amp; decimals are fetched from chain, then stored in DB (<code>Currency</code>).
        </p>
      </div>

      {/* List */}
      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Symbol</th>
              <th className="py-2">Address</th>
              <th className="py-2">Allowed</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {/* Native ETN first */}
            <tr className="border-t">
              <td className="py-3">ETN (native)</td>
              <td className="py-3">
                <AddressChip address={ZERO_ADDRESS} showCopy />
              </td>
              <td className="py-3">{nativeAllowed ? "Yes" : "No"}</td>
              <td className="py-3">
                <div className="inline-flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={nativeAllowed || busyToken === `${ZERO_ADDRESS}-allow`}
                    title={nativeAllowed ? "Already allowed" : "Allow native ETN"}
                    onClick={() => proposeToggle(ZERO_ADDRESS, true)}
                  >
                    {busyToken === `${ZERO_ADDRESS}-allow` ? "Proposing…" : "Propose Allow"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!nativeAllowed || busyToken === `${ZERO_ADDRESS}-disallow`}
                    title={!nativeAllowed ? "Already disallowed" : "Disallow native ETN"}
                    onClick={() => proposeToggle(ZERO_ADDRESS, false)}
                  >
                    {busyToken === `${ZERO_ADDRESS}-disallow` ? "Proposing…" : "Propose Disallow"}
                  </Button>
                </div>
              </td>
            </tr>

            {list
              .filter((c) => c.kind === "ERC20" && c.tokenAddress)
              .map((c) => {
                const addr = c.tokenAddress!;
                const addrLc = addr.toLowerCase();
                const allowed = allowedMap[addrLc] ?? false;
                const busyAllow = busyToken === `${addr}-allow`;
                const busyDisallow = busyToken === `${addr}-disallow`;

                const chip = <AddressChip address={addr as `0x${string}`} showCopy />;

                return (
                  <tr key={c.id} className="border-t">
                    <td className="py-3">
                      {c.symbol}{" "}
                      <span className="text-xs text-muted-foreground">({c.decimals})</span>
                    </td>
                    <td className="py-3">
                      {EXPLORER ? (
                        <a
                          className="underline"
                          href={`${EXPLORER}/address/${addr}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {chip}
                        </a>
                      ) : (
                        chip
                      )}
                    </td>
                    <td className="py-3">{allowed ? "Yes" : "No"}</td>
                    <td className="py-3">
                      <div className="inline-flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={allowed || busyAllow}
                          title={allowed ? "Already allowed" : "Allow this currency"}
                          onClick={() => proposeToggle(addr as `0x${string}`, true)}
                        >
                          {busyAllow ? "Proposing…" : "Propose Allow"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!allowed || busyDisallow}
                          title={!allowed ? "Already disallowed" : "Disallow this currency"}
                          onClick={() => proposeToggle(addr as `0x${string}`, false)}
                        >
                          {busyDisallow ? "Proposing…" : "Propose Disallow"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

            {!loading &&
              list.filter((c) => c.kind === "ERC20" && c.tokenAddress).length === 0 && (
                <tr className="border-t">
                  <td className="py-6 text-muted-foreground" colSpan={4}>
                    No ERC-20s yet.
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
