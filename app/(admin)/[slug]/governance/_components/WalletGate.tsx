"use client";

import * as React from "react";
import { useActiveAccount } from "thirdweb/react"; // v5 hook
import ConnectWallet from "@/components/shared/connect-wallet";

export default function WalletGate({
  allowedWallets,
  children,
}: {
  allowedWallets: string[];
  children: React.ReactNode;
}) {
  const account = useActiveAccount();
  const address = account?.address as string | undefined;

  const allowedLower = React.useMemo(
    () => allowedWallets.map((w) => w.toLowerCase()),
    [allowedWallets]
  );

  // Not connected
  if (!address) {
    return (
      <div className="rounded-xl border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Connect your admin wallet to access governance tools.
        </p>
        <div className="mt-3 inline-flex">
          <ConnectWallet />
        </div>
      </div>
    );
  }

  // Connected but not on the admin allowlist
  const isAllowed = allowedLower.includes(address.toLowerCase());
  if (!isAllowed) {
    return (
      <div className="rounded-xl border p-6 text-center">
        <p className="text-sm">
          The connected wallet isn’t in the allowed admin list.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Switch to an approved wallet or ask an owner to add it to{" "}
          <code>ADMIN_WALLETS</code>.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
