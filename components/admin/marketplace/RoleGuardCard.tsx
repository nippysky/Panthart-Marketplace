"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { ethers } from "ethers";
import { getAddress } from "viem";
import { useMarketplaceAdmin } from "@/lib/hooks/useMarketplaceAdmin";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";


const MULTI_SIG_ADDRESS = (process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS || "") as `0x${string}`;

type Props = { allowedWallets: string[] };

export default function RoleGuardCard({ allowedWallets }: Props) {
  const mp = useMarketplaceAdmin();
  const [isOwner, setIsOwner] = React.useState<boolean>(false);
  const [hasConfig, setHasConfig] = React.useState<boolean | null>(null);
  const [hasPauser, setHasPauser] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!mp.address || !mp.CONFIG_ROLE || !mp.PAUSER_ROLE) return;

        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const wallet = (await signer.getAddress()).toLowerCase();
        const allowed = allowedWallets.map((x) => x.toLowerCase()).includes(wallet);
        setIsOwner(allowed);

        // hasRole(role, account)
        const market = new ethers.Contract(mp.address, MARKETPLACE_CORE_ABI as any, provider);
        const [c, p] = await Promise.all([
          market.hasRole(mp.CONFIG_ROLE, MULTI_SIG_ADDRESS),
          market.hasRole(mp.PAUSER_ROLE, MULTI_SIG_ADDRESS),
        ]);

        if (!cancelled) {
          setHasConfig(Boolean(c));
          setHasPauser(Boolean(p));
        }
      } catch {
        if (!cancelled) {
          setHasConfig(null);
          setHasPauser(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mp.address, mp.CONFIG_ROLE, mp.PAUSER_ROLE]);

  const grant = async (roleName: "CONFIG_ROLE" | "PAUSER_ROLE") => {
    try {
      if (!mp.address) throw new Error("Marketplace address missing.");
      const roleHex =
        roleName === "CONFIG_ROLE" ? mp.CONFIG_ROLE : mp.PAUSER_ROLE;
      if (!roleHex) throw new Error(`Role ${roleName} not loaded.`);

      const { signer, chainId } = await getBrowserSigner();
      const wallet = (await signer.getAddress()).toLowerCase();
      if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
        throw new Error("This wallet is not in the allowed admin list.");
      }
      if (chainId !== 52014) throw new Error("Wrong network. Switch to Chain ID 52014.");

      const iface = new ethers.Interface(MARKETPLACE_CORE_ABI as any);
      const data = iface.encodeFunctionData("grantRole", [roleHex, getAddress(MULTI_SIG_ADDRESS)]);

      const multisig = new ethers.Contract(MULTI_SIG_ADDRESS, MULTI_SIG_ABI as any, signer);
      const tx = await multisig.submitAndConfirm(
        "0x0000000000000000000000000000000000000000",
        mp.address,
        0n,
        data
      );
      toast.message(`Granting ${roleName}…`);
      await tx.wait();
      toast.success(`${roleName} granted to the multisig.`);
      mp.refresh();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  const needsAny = (hasConfig === false) || (hasPauser === false);
  if (!needsAny) return null;

  return (
    <Card className="p-6">
      <Alert className="mb-4">
        <AlertTitle>Missing roles</AlertTitle>
        <AlertDescription>
          The multisig doesn’t hold all recommended roles on the Marketplace. Grant them below.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3">
        {hasConfig === false && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">CONFIG_ROLE</div>
              <div className="text-xs text-muted-foreground">
                Required to call <code>setConfig</code>.
              </div>
            </div>
            <Button onClick={() => grant("CONFIG_ROLE")} disabled={!isOwner}>
              Grant CONFIG_ROLE
            </Button>
          </div>
        )}

        {hasPauser === false && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">PAUSER_ROLE</div>
              <div className="text-xs text-muted-foreground">
                Required to call <code>pause</code>/<code>unpause</code>.
              </div>
            </div>
            <Button onClick={() => grant("PAUSER_ROLE")} disabled={!isOwner}>
              Grant PAUSER_ROLE
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
