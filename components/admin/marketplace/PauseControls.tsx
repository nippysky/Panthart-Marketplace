"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ethers } from "ethers";
import { useMarketplaceAdmin } from "@/lib/hooks/useMarketplaceAdmin";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";


type Props = { allowedWallets: string[] };

export default function PauseControls({ allowedWallets }: Props) {
  const mp = useMarketplaceAdmin();

  const call = async (fn: "pause" | "unpause") => {
    try {
      if (!mp.address) throw new Error("Marketplace address missing.");

      const { signer, chainId } = await getBrowserSigner();
      const wallet = (await signer.getAddress()).toLowerCase();
      if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
        throw new Error("This wallet is not in the allowed admin list.");
      }
      if (chainId !== 52014) throw new Error("Wrong network. Switch to Chain ID 52014.");

      const iface = new ethers.Interface(MARKETPLACE_CORE_ABI as any);
      const data = iface.encodeFunctionData(fn, []);

      const multisig = new ethers.Contract(
        process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS!,
        MULTI_SIG_ABI as any,
        signer
      );
      const tx = await multisig.submitAndConfirm(
        "0x0000000000000000000000000000000000000000",
        mp.address,
        0n,
        data
      );
      toast.message(`${fn === "pause" ? "Pausing" : "Unpausing"} marketplace…`);
      await tx.wait();
      toast.success(`Marketplace ${fn === "pause" ? "paused" : "unpaused"} (proposal confirmed by you).`);
      mp.refresh();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium mb-4">Pause Controls</h3>
      <div className="flex gap-3">
        <Button variant="destructive" onClick={() => call("pause")} disabled={mp.paused}>
          Pause
        </Button>
        <Button onClick={() => call("unpause")} disabled={!mp.paused}>
          Unpause
        </Button>
      </div>
    </Card>
  );
}
