"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ethers } from "ethers";
import { useStolenRegistryAdmin } from "@/lib/hooks/useStolenRegistryAdmin";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import { STOLEN_REGISTRY_ABI } from "@/lib/abis/marketplace-core/stolenRegistryABI";

export default function PauseControls({ allowedWallets }: { allowedWallets: string[] }) {
  const reg = useStolenRegistryAdmin();

  const call = async (fn: "pause" | "unpause") => {
    try {
      if (!reg.address) throw new Error("Registry address missing.");

      const { signer, chainId } = await getBrowserSigner();
      const wallet = (await signer.getAddress()).toLowerCase();
      if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
        throw new Error("This wallet is not in the allowed admin list.");
      }
      if (chainId !== 52014) throw new Error("Wrong network. Switch to Chain ID 52014.");

      const iface = new ethers.Interface(STOLEN_REGISTRY_ABI as any);
      const data = iface.encodeFunctionData(fn, []);

      const multisig = new ethers.Contract(
        process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS!,
        MULTI_SIG_ABI as any,
        signer
      );
      const tx = await multisig.submitAndConfirm(
        "0x0000000000000000000000000000000000000000",
        reg.address,
        0n,
        data
      );
      toast.message(`${fn === "pause" ? "Pausing" : "Unpausing"} registry…`);
      await tx.wait();
      toast.success(`Registry ${fn === "pause" ? "paused" : "unpaused"} (proposal confirmed by you).`);
      reg.refresh();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium mb-4">Pause Controls</h3>
      <div className="flex gap-3">
        <Button variant="destructive" onClick={() => call("pause")} disabled={reg.paused || !reg.address}>
          Pause
        </Button>
        <Button onClick={() => call("unpause")} disabled={!reg.paused || !reg.address}>
          Unpause
        </Button>
      </div>
    </Card>
  );
}
