"use client";

import * as React from "react";
import { useMultisig } from "@/lib/hooks/useMultisig";
import { formatEther, getAddress } from "viem";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import NewTxDialog, { NewTxDraft } from "./NewTxDialog";
import { ethers } from "ethers";
import { ZERO_ADDRESS, getBrowserSigner } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import TxTable from "./TxTable";

type Props = {
  allowedWallets: string[];
};

export default function AdminMultisigClient({ allowedWallets }: Props) {
  const {
    address,
    owners,
    required,
    balanceWei,
    txs,
    loading,
    error,
    refresh,
    chainId,
    hasConfirmed, // <— from hook
  } = useMultisig({ take: 25 });

  const [open, setOpen] = React.useState(false);

  // Track connected wallet & which txs it already confirmed
  const [currentWallet, setCurrentWallet] = React.useState<`0x${string}` | undefined>(undefined);
  const [mineConfirmed, setMineConfirmed] = React.useState<Record<number, boolean>>({});

  // Populate current wallet + per-tx confirmation flags
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { signer } = await getBrowserSigner();
        const w = (await signer.getAddress());
        const wChecksum = getAddress(w) as `0x${string}`;

        const flags: Record<number, boolean> = {};
        for (const t of txs) {
          flags[t.index] = await hasConfirmed(t.index, wChecksum);
        }

        if (!cancelled) {
          setCurrentWallet(wChecksum);
          setMineConfirmed(flags);
        }
      } catch {
        if (!cancelled) {
          setCurrentWallet(undefined);
          setMineConfirmed({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txs, hasConfirmed]);

  const isOwner =
    !!currentWallet &&
    owners.map((o) => o.toLowerCase()).includes(currentWallet.toLowerCase());

  const submitNewTx = async (draft: NewTxDraft) => {
    try {
      const { signer, chainId } = await getBrowserSigner();
      const wallet = (await signer.getAddress()).toLowerCase();
      if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
        throw new Error("This wallet is not in the allowed admin list.");
      }
      if (!address) throw new Error("Multisig address missing.");
      if (chainId !== 52014) throw new Error(`Wrong network. Please switch to Chain ID 52014.`);

      const contract = new ethers.Contract(address, MULTI_SIG_ABI as any, signer);

      const to = getAddress(draft.to);
      const value = ethers.parseEther(draft.valueEtn || "0");
      const data = draft.data && draft.data.length > 0 ? draft.data : "0x";

      // Native ETN path → tokenAddress = 0x0
      const txResp = await contract.submitAndConfirm(ZERO_ADDRESS, to, value, data);
      toast.message("Submitting transaction…");
      await txResp.wait();
      toast.success("Transaction submitted & your confirmation recorded.");
      setOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <div className="space-y-8">
      {/* Owners-only banner */}
      {!isOwner && (
        <Alert className="border-amber-300/50 bg-amber-50/5">
          <AlertTitle>View only</AlertTitle>
          <AlertDescription>
            Connect one of the multisig owners to confirm or execute transactions.
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Safe Summary</h2>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Safe Address</div>
                <div className="font-mono break-all">{address}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Network</div>
                <div>Chain ID {chainId ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">ETN Balance</div>
                <div>{formatEther(balanceWei)} ETN</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Required Confirmations</div>
                <div className="text-xl font-semibold">{required}</div>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-xs uppercase text-muted-foreground mb-2">Owners</div>
              <div className="flex flex-wrap gap-2">
                {owners.map((o) => (
                  <span key={o} className="px-2 py-1 rounded bg-muted font-mono text-xs">
                    {o.slice(0, 6)}…{o.slice(-4)}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              Allowed admin wallets: {allowedWallets.join(", ")}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Button variant="outline" onClick={refresh}>
              Refresh
            </Button>
            <Button onClick={() => setOpen(true)} disabled={!isOwner}>
              New transaction
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-base font-medium mb-4">Recent Transactions</h3>
        <TxTable
          txs={txs}
          explorerUrl={process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL}
          multisigAddress={address as `0x${string}`}
          allowedWallets={allowedWallets}
          owners={owners}
          currentWallet={currentWallet}
          mineConfirmed={mineConfirmed}
          hasConfirmed={hasConfirmed} // <— pass through
          onActionDone={refresh}
        />
        {loading && <div className="text-sm text-muted-foreground mt-2">Loading…</div>}
        {error && <div className="text-sm text-red-500 mt-2">{error}</div>}
      </Card>

      <NewTxDialog open={open} onOpenChange={setOpen} onSubmit={submitNewTx} />
    </div>
  );
}
