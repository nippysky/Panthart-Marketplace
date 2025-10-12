"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shortAddress, formatETN, formatDate } from "@/lib/format";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { toast } from "sonner";
import { ethers } from "ethers";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";

export type UiTx = {
  index: number;
  to: `0x${string}`;
  tokenAddress: `0x${string}`;
  valueWei: bigint;
  executed: boolean;
  confirmations: number;
  required: number;
  data: `0x${string}` | "0x";
};

function StatusBadge({
  executed,
  confirmations,
  required,
}: {
  executed: boolean;
  confirmations: number;
  required: number;
}) {
  if (executed) return <Badge variant="secondary">Executed</Badge>;
  if (confirmations >= required) return <Badge variant="default">Ready</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

// Tiny avatar chip for an address (Dicebear identicon)
function AvatarChip({ addr, highlight }: { addr: `0x${string}`; highlight?: boolean }) {
  const url = `https://api.dicebear.com/7.x/identicon/svg?seed=${addr}`;
  return (
    <img
      src={url}
      alt={addr}
      width={20}
      height={20}
      className={`rounded-full ring-1 ${highlight ? "ring-emerald-500" : "ring-border"} bg-background`}
    />
  );
}

// Shows which owners confirmed a given tx (avatars + hover list)
function ConfirmersCell({
  txIndex,
  owners,
  hasConfirmed,
  currentWallet,
}: {
  txIndex: number;
  owners: `0x${string}`[];
  hasConfirmed: (txIndex: number, owner?: `0x${string}`) => Promise<boolean>;
  currentWallet?: `0x${string}`;
}) {
  const [confirmed, setConfirmed] = React.useState<`0x${string}`[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const checks = await Promise.all(owners.map((o) => hasConfirmed(txIndex, o)));
        const list = owners.filter((_, i) => checks[i]);
        if (!cancelled) setConfirmed(list);
      } catch {
        if (!cancelled) setConfirmed([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txIndex, owners, hasConfirmed]);

  if (owners.length === 0) return null;

  // avatar strip with hover list
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="mt-1 flex -space-x-1 items-center">
          {confirmed.map((a) => (
            <div key={a} className="inline-block">
              <AvatarChip addr={a} highlight={currentWallet ? a.toLowerCase() === currentWallet.toLowerCase() : false} />
            </div>
          ))}
          {confirmed.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-64">
        <div className="text-xs font-medium mb-2">Confirmed by</div>
        {confirmed.length === 0 ? (
          <div className="text-xs text-muted-foreground">No confirmations yet.</div>
        ) : (
          <ul className="space-y-1">
            {confirmed.map((a) => (
              <li key={a} className="flex items-center gap-2">
                <AvatarChip addr={a} highlight={currentWallet ? a.toLowerCase() === currentWallet.toLowerCase() : false} />
                <span className="font-mono text-xs">{a.slice(0, 8)}…{a.slice(-6)}</span>
              </li>
            ))}
          </ul>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

type Props = {
  txs: UiTx[];
  explorerUrl?: string;

  multisigAddress: `0x${string}`;
  allowedWallets: string[];
  owners?: `0x${string}`[];
  currentWallet?: `0x${string}`;
  mineConfirmed?: Record<number, boolean>;
  hasConfirmed: (txIndex: number, owner?: `0x${string}`) => Promise<boolean>;
  onActionDone?: () => void;
};

export default function TxTable({
  txs,
  explorerUrl,
  multisigAddress,
  allowedWallets,
  owners = [],
  currentWallet,
  mineConfirmed = {},
  hasConfirmed,
  onActionDone,
}: Props) {
  const [busy, setBusy] = React.useState<{ idx: number; kind: "confirm" | "execute" } | null>(null);

  const isOwner = currentWallet
    ? owners.map((o) => o.toLowerCase()).includes(currentWallet.toLowerCase())
    : false;

  const guardAllowed = async () => {
    const { signer, chainId } = await getBrowserSigner();
    const addr = (await signer.getAddress()).toLowerCase();
    if (!allowedWallets.map((x) => x.toLowerCase()).includes(addr)) {
      throw new Error("This wallet is not in the allowed admin list.");
    }
    if (chainId !== 52014) {
      throw new Error("Wrong network. Please switch to Chain ID 52014.");
    }
    return signer;
  };

  const onConfirm = async (txIndex: number) => {
    try {
      setBusy({ idx: txIndex, kind: "confirm" });
      const signer = await guardAllowed();
      const contract = new ethers.Contract(multisigAddress, MULTI_SIG_ABI as any, signer);
      const resp = await contract.confirmTransaction(BigInt(txIndex));
      toast.message("Confirming transaction…");
      await resp.wait();
      toast.success(`Confirmed tx #${txIndex}`);
      onActionDone?.();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const onExecute = async (txIndex: number) => {
    try {
      setBusy({ idx: txIndex, kind: "execute" });
      const signer = await guardAllowed();
      const contract = new ethers.Contract(multisigAddress, MULTI_SIG_ABI as any, signer);
      const resp = await contract.executeTransaction(BigInt(txIndex));
      toast.message("Executing transaction…");
      await resp.wait();
      toast.success(`Executed tx #${txIndex}`);
      onActionDone?.();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">Index</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Value (ETN)</TableHead>
            <TableHead>Confirmations</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {txs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No transactions yet.
              </TableCell>
            </TableRow>
          ) : (
            txs.map((t) => {
              const alreadyConfirmed = !!mineConfirmed[t.index];
              const canConfirm =
                !t.executed && isOwner && !alreadyConfirmed && t.confirmations < t.required;
              const canExecute = !t.executed && t.confirmations >= t.required && isOwner;

              const isConfirmBusy = busy?.idx === t.index && busy.kind === "confirm";
              const isExecuteBusy = busy?.idx === t.index && busy.kind === "execute";

              return (
                <TableRow key={t.index}>
                  <TableCell className="font-mono text-xs">{t.index}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {explorerUrl ? (
                      <a
                        className="underline"
                        href={`${explorerUrl}/address/${t.to}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddress(t.to)}
                      </a>
                    ) : (
                      shortAddress(t.to)
                    )}
                  </TableCell>
                  <TableCell>{formatETN(t.valueWei)}</TableCell>
                  <TableCell>
                    <div>
                      {t.confirmations}/{t.required}
                    </div>
                    {/* avatars of confirmed owners */}
                    <ConfirmersCell
                      txIndex={t.index}
                      owners={owners}
                      hasConfirmed={hasConfirmed}
                      currentWallet={currentWallet}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge executed={t.executed} confirmations={t.confirmations} required={t.required} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      {!t.executed && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canConfirm || isConfirmBusy}
                          onClick={() => onConfirm(t.index)}
                          title={
                            t.executed
                              ? "Already executed"
                              : !isOwner
                              ? "Only multisig owners can confirm"
                              : alreadyConfirmed
                              ? "You already confirmed this transaction"
                              : t.confirmations >= t.required
                              ? "Already has enough confirmations"
                              : undefined
                          }
                        >
                          {isConfirmBusy ? "Confirming…" : "Confirm"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canExecute || isExecuteBusy}
                        onClick={() => onExecute(t.index)}
                        title={
                          t.executed
                            ? "Already executed"
                            : t.confirmations < t.required
                            ? "Needs more confirmations"
                            : !isOwner
                            ? "Only multisig owners can execute"
                            : undefined
                        }
                      >
                        {isExecuteBusy ? "Executing…" : "Execute"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      <div className="mt-3 text-xs text-muted-foreground">
        Updated {formatDate(new Date())}. Use the Refresh button above to reload.
      </div>
    </div>
  );
}
