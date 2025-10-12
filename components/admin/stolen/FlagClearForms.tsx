"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ethers } from "ethers";
import { getAddress } from "viem";
import { useStolenRegistryAdmin } from "@/lib/hooks/useStolenRegistryAdmin";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import { STOLEN_REGISTRY_ABI } from "@/lib/abis/marketplace-core/stolenRegistryABI";

function toReasonHash(reason: string): `0x${string}` {
  return ethers.id(reason || "").toLowerCase() as `0x${string}`;
}

export default function FlagClearForms({ allowedWallets }: { allowedWallets: string[] }) {
  const reg = useStolenRegistryAdmin();

  const guard = async () => {
    const { signer, chainId } = await getBrowserSigner();
    const wallet = (await signer.getAddress()).toLowerCase();
    if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
      throw new Error("This wallet is not in the allowed admin list.");
    }
    if (chainId !== 52014) throw new Error("Wrong network. Switch to Chain ID 52014.");
    return signer;
  };

  const submitCall = async (data: string, note: string) => {
    const signer = await guard();
    const multisig = new ethers.Contract(
      process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS!,
      MULTI_SIG_ABI as any,
      signer
    );
    const tx = await multisig.submitAndConfirm(
      "0x0000000000000000000000000000000000000000",
      reg.address!,
      0n,
      data
    );
    toast.message(note);
    await tx.wait();
    toast.success("Proposal submitted (and confirmed by you).");
    reg.refresh(); // keep UI in sync
  };

  // Flag/Clear single item
  const [itemAddr, setItemAddr] = React.useState("");
  const [itemId, setItemId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [evidence, setEvidence] = React.useState("");

  const onFlagItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const iface = new ethers.Interface(STOLEN_REGISTRY_ABI as any);
      const data = iface.encodeFunctionData("flag", [
        getAddress(itemAddr),
        BigInt(itemId || "0"),
        toReasonHash(reason),
        evidence,
      ]);
      await submitCall(data, "Flagging item…");
      setReason("");
      setEvidence("");
    } catch (err: any) {
      toast.error(err?.message || String(err));
    }
  };

  const onClearItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const iface = new ethers.Interface(STOLEN_REGISTRY_ABI as any);
      const data = iface.encodeFunctionData("clear", [
        getAddress(itemAddr),
        BigInt(itemId || "0"),
      ]);
      await submitCall(data, "Clearing item…");
    } catch (err: any) {
      toast.error(err?.message || String(err));
    }
  };

  // Flag/Clear collection
  const [colAddr, setColAddr] = React.useState("");
  const [colReason, setColReason] = React.useState("");
  const [colEvidence, setColEvidence] = React.useState("");

  const onFlagCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const iface = new ethers.Interface(STOLEN_REGISTRY_ABI as any);
      const data = iface.encodeFunctionData("flagCollection", [
        getAddress(colAddr),
        toReasonHash(colReason),
        colEvidence,
      ]);
      await submitCall(data, "Flagging collection…");
      setColReason("");
      setColEvidence("");
    } catch (err: any) {
      toast.error(err?.message || String(err));
    }
  };

  const onClearCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const iface = new ethers.Interface(STOLEN_REGISTRY_ABI as any);
      const data = iface.encodeFunctionData("clearCollection", [getAddress(colAddr)]);
      await submitCall(data, "Clearing collection…");
    } catch (err: any) {
      toast.error(err?.message || String(err));
    }
  };

  return (
    <div className="space-y-8">
      {/* Item actions */}
      <Card className="p-6">
        <h3 className="text-base font-medium mb-4">Item Actions</h3>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-5" onSubmit={(e) => e.preventDefault()}>
          <div className="md:col-span-2">
            <Label className="mb-1 block">Token Contract</Label>
            <Input value={itemAddr} onChange={(e) => setItemAddr(e.target.value)} placeholder="0x…" />
          </div>
          <div>
            <Label className="mb-1 block">Token ID</Label>
            <Input value={itemId} onChange={(e) => setItemId(e.target.value)} inputMode="numeric" />
          </div>

          <div className="md:col-span-3">
            <Label className="mb-1 block">Reason (free text → keccak256)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. stolen report 123" />
          </div>
          <div className="md:col-span-3">
            <Label className="mb-1 block">Evidence URL</Label>
            <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://…" />
          </div>

          <div className="md:col-span-3 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClearItem} disabled={!itemAddr || !itemId || !reg.address}>
              Propose Clear
            </Button>
            <Button type="button" onClick={onFlagItem} disabled={!itemAddr || !itemId || !reg.address}>
              Propose Flag
            </Button>
          </div>
        </form>
      </Card>

      {/* Collection actions */}
      <Card className="p-6">
        <h3 className="text-base font-medium mb-4">Collection Actions</h3>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-5" onSubmit={(e) => e.preventDefault()}>
          <div className="md:col-span-3">
            <Label className="mb-1 block">Collection Contract</Label>
            <Input value={colAddr} onChange={(e) => setColAddr(e.target.value)} placeholder="0x…" />
          </div>

          <div className="md:col-span-3">
            <Label className="mb-1 block">Reason (free text → keccak256)</Label>
            <Input value={colReason} onChange={(e) => setColReason(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label className="mb-1 block">Evidence URL</Label>
            <Input value={colEvidence} onChange={(e) => setColEvidence(e.target.value)} placeholder="https://…" />
          </div>

          <div className="md:col-span-3 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClearCollection} disabled={!colAddr || !reg.address}>
              Propose Clear Collection
            </Button>
            <Button type="button" onClick={onFlagCollection} disabled={!colAddr || !reg.address}>
              Propose Flag Collection
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
