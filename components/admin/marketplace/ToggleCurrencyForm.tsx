"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ethers } from "ethers";
import { useMarketplaceAdmin, ZERO_ADDRESS } from "@/lib/hooks/useMarketplaceAdmin";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";


type Props = { allowedWallets: string[] };

export default function ToggleCurrencyForm({ allowedWallets }: Props) {
  const mp = useMarketplaceAdmin();
  const [allowed, setAllowed] = React.useState<boolean>(true);

  React.useEffect(() => {
    setAllowed(mp.etnAllowed);
  }, [mp.etnAllowed]);

  const onSubmit = async () => {
    try {
      if (!mp.address) throw new Error("Marketplace address missing.");

      const { signer, chainId } = await getBrowserSigner();
      const wallet = (await signer.getAddress()).toLowerCase();
      if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
        throw new Error("This wallet is not in the allowed admin list.");
      }
      if (chainId !== 52014) throw new Error("Wrong network. Switch to Chain ID 52014.");

      const iface = new ethers.Interface(MARKETPLACE_CORE_ABI as any);
      const data = iface.encodeFunctionData("setCurrencyAllowed", [ZERO_ADDRESS, allowed]);

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
      toast.message("Updating ETN currency allowlist…");
      await tx.wait();
      toast.success("ETN allowlist updated (proposal confirmed by you).");
      mp.refresh();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium mb-4">ETN Currency Allow</h3>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label className="mb-1 block">Allow ETN payments (native)</Label>
          <div className="text-xs text-muted-foreground">
            Toggles <code>setCurrencyAllowed(0x0, allowed)</code>.
          </div>
        </div>
        <Switch checked={allowed} onCheckedChange={setAllowed} />
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={onSubmit}>Propose via Multisig</Button>
      </div>
    </Card>
  );
}
