"use client";

import React, { useEffect, PropsWithChildren } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { useWalletStore } from "@/lib/hooks/useWallet";

export default function WalletSyncProvider({ children }: PropsWithChildren) {
  const { address, isConnected } = useWallet();
  const setSyncing = useWalletStore((s) => s.setSyncing);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isConnected || !address) return;
      setSyncing(true);
      try {
        const res = await fetch("/api/profile/upsert-user", {
          method: "POST",
          headers: { "x-user-address": address },
        });
        if (!res.ok) console.error("upsert-user failed", res.status);
      } catch (e) {
        console.error("upsert-user error", e);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [isConnected, address, setSyncing]);

  return <>{children}</>;
}
