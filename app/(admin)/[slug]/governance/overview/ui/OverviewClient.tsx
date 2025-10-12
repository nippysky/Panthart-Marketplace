"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatEther } from "viem";
import { useMultisig } from "@/lib/hooks/useMultisig";
import TxTable from "@/components/admin/multisig/TxTable";
import { getBrowserSigner } from "@/lib/evm/getSigner";

export default function OverviewClient({
  allowedWallets,
  baseHref,
}: {
  allowedWallets: string[];
  baseHref: string;
}) {
  const {
    address,
    owners,
    required,
    balanceWei,
    txs,
    loading,
    error,
    refresh,
    hasConfirmed, // <-- use from hook
  } = useMultisig({ take: 5 });

  // currently connected wallet (optional)
  const [currentWallet, setCurrentWallet] = React.useState<`0x${string}` | undefined>(undefined);
  React.useEffect(() => {
    (async () => {
      try {
        const { signer } = await getBrowserSigner();
        setCurrentWallet((await signer.getAddress()) as `0x${string}`);
      } catch {
        setCurrentWallet(undefined);
      }
    })();
  }, []);

  // Precompute: which txs have I already confirmed?
  const [mineConfirmed, setMineConfirmed] = React.useState<Record<number, boolean>>({});
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentWallet || !address || txs.length === 0) {
        if (!cancelled) setMineConfirmed({});
        return;
      }
      try {
        const checks = await Promise.all(txs.map((t) => hasConfirmed(t.index, currentWallet)));
        const map: Record<number, boolean> = {};
        checks.forEach((v, i) => (map[txs[i].index] = !!v));
        if (!cancelled) setMineConfirmed(map);
      } catch {
        if (!cancelled) setMineConfirmed({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txs, currentWallet, address, hasConfirmed]);

  return (
    <div className="space-y-8">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Safe Summary</h2>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Safe Address</div>
                <div className="font-mono break-all">{address}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Owners</div>
                <div className="flex flex-wrap gap-2">
                  {owners.map((o) => (
                    <span key={o} className="px-2 py-1 rounded bg-muted font-mono text-xs">
                      {o.slice(0, 6)}…{o.slice(-4)}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Required</div>
                <div className="text-xl font-semibold">{required}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">ETN Balance</div>
                <div>{formatEther(balanceWei)} ETN</div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh}>
              Refresh
            </Button>
            <Link href={`${baseHref}/transactions`}>
              <Button>Open Transactions</Button>
            </Link>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">Latest Transactions</h3>
          <Link href={`${baseHref}/transactions`} className="text-sm underline">
            View all
          </Link>
        </div>
        <div className="mt-4">
          <TxTable
            txs={txs}
            explorerUrl={process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL}
            multisigAddress={address as `0x${string}`}
            allowedWallets={allowedWallets}
            owners={owners}
            currentWallet={currentWallet}
            mineConfirmed={mineConfirmed}
            hasConfirmed={hasConfirmed}
            onActionDone={refresh}
          />
          {loading && <div className="text-sm text-muted-foreground mt-2">Loading…</div>}
          {error && <div className="text-sm text-red-500 mt-2">{error}</div>}
        </div>
      </Card>
    </div>
  );
}
