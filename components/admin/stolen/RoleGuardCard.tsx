"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AddressChip from "@/components/common/AddressChip";
import { toast } from "sonner";
import { ethers } from "ethers";
import { useStolenRegistryAdmin } from "@/lib/hooks/useStolenRegistryAdmin";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import { STOLEN_REGISTRY_ABI } from "@/lib/abis/marketplace-core/stolenRegistryABI";

const MULTISIG = process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS as `0x${string}`;

export default function RoleGuardCard({ allowedWallets }: { allowedWallets: string[] }) {
  const reg = useStolenRegistryAdmin();
  const [hasReporter, setHasReporter] = React.useState<boolean | null>(null);
  const [hasClearer, setHasClearer] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    (async () => {
      if (!reg.address || !MULTISIG || !reg.REPORTER_ROLE || !reg.CLEARER_ROLE) {
        setHasReporter(null);
        setHasClearer(null);
        return;
      }
      setHasReporter(await reg.hasRole(reg.REPORTER_ROLE, MULTISIG));
      setHasClearer(await reg.hasRole(reg.CLEARER_ROLE, MULTISIG));
    })();
  }, [reg.address, reg.REPORTER_ROLE, reg.CLEARER_ROLE, reg.hasRole]);

  const grant = async (role: "REPORTER_ROLE" | "CLEARER_ROLE") => {
    try {
      if (!reg.address) throw new Error("Registry address missing.");
      const { signer, chainId } = await getBrowserSigner();
      const wallet = (await signer.getAddress()).toLowerCase();
      if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
        throw new Error("This wallet is not in the allowed admin list.");
      }
      if (chainId !== 52014) throw new Error("Wrong network. Switch to Chain ID 52014.");

      const roleId = role === "REPORTER_ROLE" ? reg.REPORTER_ROLE : reg.CLEARER_ROLE;
      if (!roleId) throw new Error("Role id not loaded yet.");

      const iface = new ethers.Interface(STOLEN_REGISTRY_ABI as any);
      const data = iface.encodeFunctionData("grantRole", [roleId, MULTISIG]);

      const multisig = new ethers.Contract(MULTISIG, MULTI_SIG_ABI as any, signer);
      const tx = await multisig.submitAndConfirm(
        "0x0000000000000000000000000000000000000000",
        reg.address,
        0n,
        data
      );
      toast.message(`Granting ${role} to multisig…`);
      await tx.wait();
      toast.success(`${role} granted (proposal confirmed by you).`);
      reg.refresh();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium mb-4">Role Guard (Multisig)</h3>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <div className="text-xs uppercase text-muted-foreground mb-1">Registry</div>
          {/* pass a string, not undefined */}
          <AddressChip address={(reg.address || "") as string} showCopy />
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground mb-1">Multisig</div>
          <AddressChip address={MULTISIG} showCopy />
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground mb-1">Network</div>
          <div>Chain ID {reg.chainId ?? "-"}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">REPORTER_ROLE</div>
            <div className="text-xs text-muted-foreground">
              Can flag items/collections as stolen.
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => grant("REPORTER_ROLE")}
            disabled={(hasReporter ?? true) || !reg.address}
            title={hasReporter ? "Multisig already has this role" : "Grant role to multisig"}
          >
            {hasReporter ? "Granted" : "Grant"}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">CLEARER_ROLE</div>
            <div className="text-xs text-muted-foreground">
              Can clear previously flagged items/collections.
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => grant("CLEARER_ROLE")}
            disabled={(hasClearer ?? true) || !reg.address}
            title={hasClearer ? "Multisig already has this role" : "Grant role to multisig"}
          >
            {hasClearer ? "Granted" : "Grant"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
