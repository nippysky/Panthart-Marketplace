"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useMarketplaceAdmin } from "@/lib/hooks/useMarketplaceAdmin";
import FundRewardsForm from "./FundRewardsForm";
import PauseControls from "./PauseControls";
import RoleGuardCard from "./RoleGuardCard";
import SetConfigForm from "./SetConfigForm";
import ToggleCurrencyForm from "./ToggleCurrencyForm";
import CurrencyManager from "./CurrencyManager";
import AddressChip from "@/components/common/AddressChip";

type Props = { allowedWallets: string[] };

export default function MarketplaceAdminPanel({ allowedWallets }: Props) {
  const mp = useMarketplaceAdmin();

  return (
    <div className="space-y-8">
      {mp.error && (
        <Alert className="border-red-300/50 bg-red-50/5">
          <AlertTitle>Read error</AlertTitle>
          <AlertDescription>{mp.error}</AlertDescription>
        </Alert>
      )}

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Marketplace Overview</h2>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Contract</div>
                <AddressChip address={mp.address || "-"} />
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Network</div>
                <div>Chain ID {mp.chainId ?? "-"}</div>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Paused</div>
                <div className={mp.paused ? "text-red-500" : "text-emerald-600"}>
                  {mp.paused ? "Yes" : "No"}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Fee Bps</div>
                <div className="font-medium">{mp.feeBps.toString()}</div>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">
                  Distributor Share Bps
                </div>
                <div className="font-medium">{mp.distributorShareBps.toString()}</div>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Snipe Extension (s)</div>
                <div className="font-medium">{mp.snipeExtension.toString()}</div>
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Fee Recipient</div>
                <AddressChip address={mp.feeRecipient || "-"} />
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Rewards Distributor</div>
                <AddressChip address={mp.rewardsDistributor || "-"} />
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">Stolen Registry</div>
                <AddressChip address={mp.stolenRegistry || "-"} />
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase text-muted-foreground">ETN Allowed</div>
                <div className="font-medium">{mp.etnAllowed ? "Yes" : "No"}</div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Button variant="outline" onClick={mp.refresh}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Role guard */}
      <RoleGuardCard allowedWallets={allowedWallets} />

      {/* Core actions */}
      <SetConfigForm allowedWallets={allowedWallets} />
      <PauseControls allowedWallets={allowedWallets} />
      <ToggleCurrencyForm allowedWallets={allowedWallets} />

      {/* NEW: ERC-20 manager */}
      <CurrencyManager allowedWallets={allowedWallets} />

      <FundRewardsForm allowedWallets={allowedWallets} />
    </div>
  );
}
