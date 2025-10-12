"use client";

import ConnectWallet from "@/components/shared/connect-wallet";

export default function WalletHeader() {
  return (
    <div className="ml-auto">
      <ConnectWallet />
    </div>
  );
}
