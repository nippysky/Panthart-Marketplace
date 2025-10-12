"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ethers } from "ethers";
import { useMarketplaceAdmin } from "@/lib/hooks/useMarketplaceAdmin";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import { REWARD_DISTRIBUTOR_ABI } from "@/lib/abis/marketplace-core/rewardDistributorABI";

type Props = { allowedWallets: string[] };

export default function FundRewardsForm({ allowedWallets }: Props) {
  const mp = useMarketplaceAdmin();
  const [amount, setAmount] = React.useState<string>("0.0");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!mp.REWARD_DISTRIBUTOR_ADDRESS) throw new Error("Rewards Distributor address missing.");
      const val = ethers.parseEther(amount || "0");
      if (val <= 0n) throw new Error("Enter a positive ETN amount.");

      const { signer, chainId } = await getBrowserSigner();
      const wallet = (await signer.getAddress()).toLowerCase();
      if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
        throw new Error("This wallet is not in the allowed admin list.");
      }
      if (chainId !== 52014) throw new Error("Wrong network. Switch to Chain ID 52014.");

      // Call depositNative() with value to emit Funded
      const iface = new ethers.Interface(REWARD_DISTRIBUTOR_ABI as any);
      const data = iface.encodeFunctionData("depositNative", []);

      const multisig = new ethers.Contract(
        process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS!,
        MULTI_SIG_ABI as any,
        signer
      );
      const tx = await multisig.submitAndConfirm(
        "0x0000000000000000000000000000000000000000",
        mp.REWARD_DISTRIBUTOR_ADDRESS,
        val,
        data
      );
      toast.message("Funding rewards pool…");
      await tx.wait();
      toast.success("Rewards Distributor funded (proposal confirmed by you).");
      setAmount("0.0");
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium mb-4">Fund Rewards Distributor (ETN)</h3>
      <form className="grid grid-cols-1 md:grid-cols-3 gap-5" onSubmit={onSubmit}>
        <div className="md:col-span-2 space-y-2">
          <Label>Amount (ETN)</Label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.0"
          />
        </div>
        <div className="md:col-span-1 flex items-end justify-end">
          <Button type="submit">Propose via Multisig</Button>
        </div>
      </form>
      <div className="text-xs text-muted-foreground mt-3">
        Calls <code>depositNative()</code> on the Rewards Distributor, sending the specified ETN value.
      </div>
    </Card>
  );
}
