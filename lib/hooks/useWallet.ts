// lib/hooks/useWallet.ts
"use client";

import { useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import { create } from "zustand";
import { isAddress, getAddress } from "viem";

interface WalletState {
  address:     string | null;
  isConnected: boolean;
  syncing:     boolean;
  setAddress:  (address: string | null) => void;
  setSyncing:  (syncing: boolean) => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  address:     null,
  isConnected: false,
  syncing:     false,
  setAddress:  (address) => {
    // avoid unnecessary updates/rerenders
    if (get().address === address) return;
    set({ address, isConnected: Boolean(address) });
  },
  setSyncing:  (syncing) => set({ syncing }),
}));

export function useWallet() {
  const account    = useActiveAccount();
  const setAddress = useWalletStore((s) => s.setAddress);

  useEffect(() => {
    const raw = account?.address ?? null;
    const checksum = raw && isAddress(raw) ? getAddress(raw) : raw; // ✅ keep checksum form
    setAddress(checksum);
  }, [account?.address, setAddress]);

  const address     = useWalletStore((s) => s.address);
  const isConnected = useWalletStore((s) => s.isConnected);
  const syncing     = useWalletStore((s) => s.syncing);

  return { address, isConnected, syncing };
}
