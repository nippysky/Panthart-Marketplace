"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ethers } from "ethers";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";

type TxRow = {
  index: number;
  executed: boolean;
  confirmations: number;
  required: number;
};

type Props = {
  tx: TxRow;
  multisigAddress: `0x${string}`;
  allowedWallets: string[]; // checks UI access only
  onDone: () => void;       // refresh callback
};

export default function TxActions({ tx, multisigAddress, allowedWallets, onDone }: Props) {
  const [busy, setBusy] = React.useState<"confirm" | "execute" | null>(null);

  const guardAllowed = async () => {
    const { signer, chainId } = await getBrowserSigner();
    const addr = (await signer.getAddress()).toLowerCase();
    if (!allowedWallets.map((x) => x.toLowerCase()).includes(addr)) {
      throw new Error("This wallet is not in the allowed admin list.");
    }
    // Optional: ensure correct chain (ETN mainnet 52014)
    if (chainId !== 52014) {
      throw new Error(`Wrong network. Please switch to Chain ID 52014.`);
    }
    return signer;
  };

  const confirm = async () => {
    try {
      setBusy("confirm");
      const signer = await guardAllowed();
      const contract = new ethers.Contract(multisigAddress, MULTI_SIG_ABI as any, signer);
      const txResp = await contract.confirmTransaction(BigInt(tx.index));
      await txResp.wait();
      toast.success(`Confirmed tx #${tx.index}`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const execute = async () => {
    try {
      setBusy("execute");
      const signer = await guardAllowed();
      const contract = new ethers.Contract(multisigAddress, MULTI_SIG_ABI as any, signer);
      const txResp = await contract.executeTransaction(BigInt(tx.index));
      await txResp.wait();
      toast.success(`Executed tx #${tx.index}`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const canExecute = !tx.executed && tx.confirmations >= tx.required;

  return (
    <div className="flex items-center gap-2">
      {!tx.executed && (
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={confirm}>
          {busy === "confirm" ? "Confirming…" : "Confirm"}
        </Button>
      )}
      <Button size="sm" disabled={!canExecute || busy !== null} onClick={execute}>
        {busy === "execute" ? "Executing…" : "Execute"}
      </Button>
    </div>
  );
}
