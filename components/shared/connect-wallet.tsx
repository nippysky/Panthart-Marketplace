// components/shared/connect-wallet.tsx
"use client";

import React from "react";
import { useTheme } from "next-themes";
import { defineChain } from "thirdweb";
import { ConnectButton, darkTheme } from "thirdweb/react";
import { createWallet } from "thirdweb/wallets";
import { client } from "@/lib/client";

// wallets
const wallets = [createWallet("io.metamask"), createWallet("io.rabby")];
const recommendedWallets = [createWallet("io.metamask"), createWallet("io.rabby")];

const SORA_STACK =
  "Sora, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";

export default function ConnectWallet() {
  const { theme } = useTheme();

  return (
    <ConnectButton
      client={client}
      wallets={wallets}
      recommendedWallets={recommendedWallets}
      chain={defineChain({
        id: 52014,
        rpc: "https://rpc.ankr.com/electroneum",
        nativeCurrency: {
          name: "Electroneum",
          symbol: "ETN",
          decimals: 18,
        },
        blockExplorers: [
          {
            name: "Electroneum Block Explorer",
            url: "https://blockexplorer.electroneum.com",
          },
        ],
        icon: {
          url: "https://s2.coinmarketcap.com/static/img/coins/200x200/2137.png",
          width: 10,
          height: 10,
          format: "png",
        },
      })}
      theme={darkTheme({
        fontFamily: SORA_STACK, // 👈 use Sora in the widget + modal
        colors: {
          accentText: theme === "light" ? "#131418" : "#4DEE54",
          accentButtonBg: theme === "light" ? "#131418" : "#4DEE54",
          modalBg: theme === "light" ? "#ffffff" : "#131418",
          primaryText: theme === "light" ? "#000000" : "#ffffff",
          primaryButtonBg: theme === "light" ? "#131418" : "#4DEE54",
          primaryButtonText: theme === "light" ? "#ffffff" : "#131418",
          tertiaryBg: theme === "light" ? "#F5F5F5" : "#000000",
          secondaryButtonBg: theme === "light" ? "#f5f5f5" : "#000000",
          secondaryButtonText: theme === "light" ? "#131418" : "#ffffff",
          connectedButtonBg: theme === "light" ? "#F5F5F5" : "#131418", // fixed "##"
          connectedButtonBgHover: theme === "light" ? "#ffffff" : "#000000",
          borderColor: theme === "light" ? "#E5E5E5" : "#FFFFFF1A",
        },
      })}
      connectModal={{
        size: "compact",
        title: "Connect Wallet",
        showThirdwebBranding: false,
      }}
    />
  );
}
