"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import FundRewardsForm from "@/components/admin/marketplace/FundRewardsForm";
import TxTable from "@/components/admin/multisig/TxTable";
import { useMultisig } from "@/lib/hooks/useMultisig";
import { getBrowserSigner } from "@/lib/evm/getSigner";

const DISTRIBUTOR = process.env
  .NEXT_PUBLIC_REWARD_DISTRIBUTOR_ADDRESS as `0x${string}` | undefined;

export default function RewardsPanel({ allowedWallets }: { allowedWallets: string[] }) {
  const { address, owners, txs, refresh, hasConfirmed } = useMultisig({ take: 50 });

  // filter to distributor-bound txs
  const related = React.useMemo(
    () => (DISTRIBUTOR ? txs.filter((t) => t.to.toLowerCase() === DISTRIBUTOR.toLowerCase()) : []),
    [txs]
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
      if (!currentWallet || !address || related.length === 0) {
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
  }, [related, currentWallet, address, hasConfirmed]);

  return (
    <div className="space-y-8">
      <Card className="p-6">
        <h3 className="text-base font-medium mb-4">Fund Rewards Distributor</h3>
        <FundRewardsForm allowedWallets={allowedWallets} />
      </Card>

      <Card className="p-6">
        <h3 className="text-base font-medium mb-4">Related Transactions</h3>
        <TxTable
          txs={related}
          explorerUrl={process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL}
          multisigAddress={address as `0x${string}`}
          allowedWallets={allowedWallets}
          owners={owners}
          currentWallet={currentWallet}
          mineConfirmed={mineConfirmed}
          hasConfirmed={hasConfirmed}
          onActionDone={refresh}
        />
      </Card>
    </div>
  );
}
