"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AddressChip from "@/components/common/AddressChip";
import { useStolenRegistryAdmin } from "@/lib/hooks/useStolenRegistryAdmin";
import RoleGuardCard from "./RoleGuardCard";
import PauseControls from "./PauseControls";
import FlagClearForms from "./FlagClearForms";
import ReportedQueue from "./ReportedQueue";
import TxTable from "@/components/admin/multisig/TxTable";
import { useMultisig } from "@/lib/hooks/useMultisig";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import CollectionReportedQueue from "./CollectionReportedQueue";
import StaffRoleManager from "./StaffRoleManager";

export default function RegistryAdminPanel({ allowedWallets }: { allowedWallets: string[] }) {
  const reg = useStolenRegistryAdmin();
  const { address: safe, owners, txs, refresh: refreshMs, hasConfirmed } = useMultisig({ take: 50 });

  const related = React.useMemo(
    () => (reg.address ? txs.filter((t) => t.to.toLowerCase() === reg.address!.toLowerCase()) : []),
    [txs, reg.address]
  );

  const [currentWallet, setCurrentWallet] = React.useState<`0x${string}` | undefined>();
  React.useEffect(() => {
    (async () => {
      try {
        const { signer } = await getBrowserSigner();
        setCurrentWallet((await signer.getAddress()) as `0x${string}`);
      } catch {
        setCurrentWallet(undefined);
      }
    })();
  }, []);

  const [mineConfirmed, setMineConfirmed] = React.useState<Record<number, boolean>>({});
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentWallet || !safe || related.length === 0) {
        if (!cancelled) setMineConfirmed({});
        return;
      }
      try {
        const checks = await Promise.all(related.map((t) => hasConfirmed(t.index, currentWallet)));
        const map: Record<number, boolean> = {};
        checks.forEach((v, i) => (map[related[i].index] = !!v));
        if (!cancelled) setMineConfirmed(map);
      } catch {
        if (!cancelled) setMineConfirmed({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [related, currentWallet, safe, hasConfirmed]);

  return (
    <div className="space-y-8">
      {/* Overview */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Stolen Registry Overview</h2>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Registry</div>
                <AddressChip address={reg.address ?? ""} showCopy />
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Network</div>
                <div>Chain ID {reg.chainId ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Paused</div>
                <div className={reg.paused ? "text-red-500" : "text-emerald-600"}>
                  {reg.paused ? "Yes" : "No"}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Button variant="outline" onClick={reg.refresh}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>


      <RoleGuardCard allowedWallets={allowedWallets} />
      <StaffRoleManager allowedWallets={allowedWallets} />
      <PauseControls allowedWallets={allowedWallets} />
      <ReportedQueue allowedWallets={allowedWallets} />
      <CollectionReportedQueue allowedWallets={allowedWallets} /> 
      <FlagClearForms allowedWallets={allowedWallets} />

      {/* Related multisig txs */}
      <Card className="p-6">
        <h3 className="text-base font-medium mb-4">Related Transactions</h3>
        <TxTable
          txs={related}
          explorerUrl={process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL}
          multisigAddress={safe as `0x${string}`}
          allowedWallets={allowedWallets}
          owners={owners}
          currentWallet={currentWallet}
          mineConfirmed={mineConfirmed}
          hasConfirmed={hasConfirmed}
          onActionDone={refreshMs}
        />
      </Card>
    </div>
  );
}
