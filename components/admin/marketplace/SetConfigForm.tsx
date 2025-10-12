"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getAddress } from "viem";
import { ethers } from "ethers";
import { useMarketplaceAdmin } from "@/lib/hooks/useMarketplaceAdmin";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";

type Props = { allowedWallets: string[] };

export default function SetConfigForm({ allowedWallets }: Props) {
  const mp = useMarketplaceAdmin();

  const [feeBps, setFeeBps] = React.useState<string>("");
  const [distBps, setDistBps] = React.useState<string>("");
  const [feeRec, setFeeRec] = React.useState<string>("");
  const [distAddr, setDistAddr] = React.useState<string>("");
  const [stolenReg, setStolenReg] = React.useState<string>("");
  const [snipeExt, setSnipeExt] = React.useState<string>("");

  // hydrate form from hook (runs on first load & whenever hook values change)
  React.useEffect(() => {
    setFeeBps(mp.feeBps.toString());
    setDistBps(mp.distributorShareBps.toString());
    setFeeRec(mp.feeRecipient ?? "");
    setDistAddr(mp.rewardsDistributor ?? "");
    setStolenReg(mp.stolenRegistry ?? "");
    setSnipeExt(mp.snipeExtension.toString());
  }, [
    mp.feeBps,
    mp.distributorShareBps,
    mp.feeRecipient,
    mp.rewardsDistributor,
    mp.stolenRegistry,
    mp.snipeExtension,
  ]);

  const onResetLocal = () => {
    // instant “revert to last loaded” (no network call)
    setFeeBps(mp.feeBps.toString());
    setDistBps(mp.distributorShareBps.toString());
    setFeeRec(mp.feeRecipient ?? "");
    setDistAddr(mp.rewardsDistributor ?? "");
    setStolenReg(mp.stolenRegistry ?? "");
    setSnipeExt(mp.snipeExtension.toString());
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!mp.address) throw new Error("Marketplace address missing.");

      const { signer, chainId } = await getBrowserSigner();
      const wallet = (await signer.getAddress()).toLowerCase();
      if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
        throw new Error("This wallet is not in the allowed admin list.");
      }
      if (chainId !== 52014) throw new Error("Wrong network. Switch to Chain ID 52014.");

      const iface = new ethers.Interface(MARKETPLACE_CORE_ABI as any);
      const data = iface.encodeFunctionData("setConfig", [
        BigInt(feeBps || "0"),
        BigInt(distBps || "0"),
        getAddress(feeRec),
        getAddress(distAddr),
        getAddress(stolenReg),
        BigInt(snipeExt || "0"),
      ]);

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
      toast.message("Proposing config update…");
      await tx.wait();
      toast.success("Config update proposed (and confirmed by you).");
      mp.refresh();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium mb-4">Update Marketplace Config</h3>
      <form className="grid grid-cols-1 md:grid-cols-3 gap-5" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label>Fee Bps</Label>
          <Input value={feeBps} onChange={(e) => setFeeBps(e.target.value)} inputMode="numeric" />
        </div>
        <div className="space-y-2">
          <Label>Distributor Share Bps</Label>
          <Input value={distBps} onChange={(e) => setDistBps(e.target.value)} inputMode="numeric" />
        </div>
        <div className="space-y-2">
          <Label>Snipe Extension (seconds)</Label>
          <Input value={snipeExt} onChange={(e) => setSnipeExt(e.target.value)} inputMode="numeric" />
        </div>
        <div className="md:col-span-3 space-y-2">
          <Label>Fee Recipient</Label>
          <Input value={feeRec} onChange={(e) => setFeeRec(e.target.value)} placeholder="0x..." />
        </div>
        <div className="md:col-span-3 space-y-2">
          <Label>Rewards Distributor</Label>
          <Input value={distAddr} onChange={(e) => setDistAddr(e.target.value)} placeholder="0x..." />
        </div>
        <div className="md:col-span-3 space-y-2">
          <Label>Stolen Registry</Label>
          <Input value={stolenReg} onChange={(e) => setStolenReg(e.target.value)} placeholder="0x..." />
        </div>

        <div className="md:col-span-3 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onResetLocal}>
            Reset
          </Button>
          <Button type="submit">Propose via Multisig</Button>
        </div>
      </form>
    </Card>
  );
}
