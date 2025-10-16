"use client";

import { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";
import Link from "next/link";
import { Copy, HandCoins } from "lucide-react";
import { toast } from "sonner";
import type { LegendRow } from "../index";
import { useLoaderStore } from "@/lib/store/loader-store";
import { createWalletClient, custom, defineChain, encodeFunctionData } from "viem";
import { REWARD_DISTRIBUTOR_ABI } from "@/lib/abis/marketplace-core/rewardDistributorABI";
import { getBadgeForCount } from "@/lib/legends/badges";
import { formatTokenAmount } from "@/lib/utils/format";

const EXPLORER =
  process.env.NEXT_PUBLIC_BLOCK_EXPLORER ||
  "https://blockexplorer.electroneum.com";

const ELECTRONEUM = defineChain({
  id: 52014,
  name: "Electroneum",
  nativeCurrency: { name: "Electroneum", symbol: "ETN", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.ankr.com/electroneum"] } },
});
const CHAIN_HEX_ID = `0x${ELECTRONEUM.id.toString(16)}` as const;

const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const REWARD_ADDR = (process.env.NEXT_PUBLIC_REWARD_DISTRIBUTOR_ADDRESS || "").trim() as `0x${string}`;

async function ensureWalletOnChain(provider: any) {
  if (!provider?.request) return;
  try {
    const currentHex = await provider.request({ method: "eth_chainId" });
    if (String(currentHex).toLowerCase() === CHAIN_HEX_ID.toLowerCase()) return;
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX_ID }] });
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_HEX_ID,
            chainName: ELECTRONEUM.name,
            nativeCurrency: ELECTRONEUM.nativeCurrency,
            rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.ankr.com/electroneum"],
            blockExplorerUrls: [EXPLORER],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export async function prepareAndClaim({
  account,
  currencySymbol,
  currencyParam,
}: {
  account: `0x${string}`;
  currencySymbol: string;
  currencyParam: string;
}) {
  const { show, hide } = useLoaderStore.getState();

  if (!REWARD_ADDR) {
    toast.error("RewardsDistributor address not configured.");
    return;
  }

  const provider = (globalThis as any).ethereum;
  if (!provider?.request) {
    toast.error("No injected wallet provider found.");
    return;
  }

  try {
    show(`Preparing claim in ${currencySymbol}…`);
    const prep = await fetch(
      `/api/rewards/prepare-claim?account=${account}&currency=${encodeURIComponent(currencyParam)}`
    );
    if (!prep.ok) {
      hide();
      const t = await prep.text().catch(() => "");
      toast.error(`Prepare failed: ${t || prep.status}`);
      return;
    }
    const { currency, total, deadline, signature } = await prep.json();

    show("Switching to Electroneum…");
    await ensureWalletOnChain(provider);

    show(`Claiming ${currencySymbol}… confirm in your wallet`);
    const wallet = createWalletClient({ chain: ELECTRONEUM, transport: custom(provider) });

    const data = encodeFunctionData({
      abi: REWARD_DISTRIBUTOR_ABI as any,
      functionName: "claim",
      args: [
        (currency?.tokenAddress || ZERO) as `0x${string}`,
        BigInt(total),
        BigInt(deadline),
        signature as `0x${string}`,
      ],
    });

    const txHash = await wallet.sendTransaction({ to: REWARD_ADDR, data, account });

    hide();
    toast.success(
      <div className="flex items-center gap-2">
        <span>Claim submitted</span>
        <Link href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer" className="underline inline-flex items-center">
          View
        </Link>
      </div>
    );
  } catch (err: any) {
    hide();
    const m = err?.shortMessage || err?.message || "Claim failed";
    toast.error(m);
  }
}

// Badge pill: label only
function BadgePill({ count }: { count: number }) {
  const badge = getBadgeForCount(count);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.06]">
      <span className="opacity-80">{badge.name}</span>
    </span>
  );
}

export function makeLegendsColumns(
  currencySymbol: string,
  currentAccountLower?: string
): ColumnDef<LegendRow>[] {
  return [
    {
      header: "Rank",
      accessorKey: "rank",
      cell: ({ row }) => <span className="font-semibold">{row.original.rank}</span>,
      enableSorting: true,
      size: 60,
    },
    {
      header: "Holder",
      accessorKey: "username",
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-full overflow-hidden bg-muted">
              {u.profileAvatar ? (
                <Image src={u.profileAvatar} alt={u.username} fill className="object-cover" unoptimized />
              ) : null}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Link
                  href={`/profile/${u.walletAddress}`}
                  className="font-medium leading-tight hover:underline text-brandsec dark:text-brand"
                >
                  {u.username}
                </Link>
                <BadgePill count={u.comrades} />
              </div>
              <div className="text-xs text-muted-foreground">
                {u.walletAddress.slice(0, 6)}…{u.walletAddress.slice(-4)}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      header: "Wallet",
      accessorKey: "walletAddress",
      cell: ({ row }) => {
        const addr = row.original.walletAddress;
        return (
          <div className="flex items-center gap-2">
            <a
              href={`${EXPLORER}/address/${addr}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm hover:underline break-all text-brandsec dark:text-brand"
            >
              {addr}
            </a>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-1.5 border border-transparent hover:border-black/10 dark:hover:border-white/10 cursor-pointer"
              onClick={async () => {
                try {
                  await navigator.clipboard?.writeText(addr);
                  toast.success("Address copied");
                } catch {
                  toast.error("Failed to copy address");
                }
              }}
              aria-label="Copy wallet address"
              title="Copy wallet address"
            >
              <Copy className="w-4 h-4 opacity-80" />
            </button>
          </div>
        );
      },
    },
    {
      header: "Comrades",
      accessorKey: "comrades",
      cell: ({ row }) => <div className="font-semibold">{row.original.comrades}</div>,
      enableSorting: true,
      size: 120,
    },
{
  header: () => <div className="text-right w-full">Claimable</div>,
  accessorKey: "feeShareWei", // <- use the wei field as the accessor
  cell: ({ row }) => {
    const wei = row.original.feeShareWei ?? "0";
    const isSelf =
      !!currentAccountLower &&
      row.original.walletAddress.toLowerCase() === currentAccountLower;

    return (
      <div className="w-full flex items-center justify-end gap-2">
        <div className="font-semibold">
          {formatTokenAmount(wei, 18, 6)} {currencySymbol}
        </div>
        {isSelf ? (
          <button
            className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-1 border hover:bg-muted"
            onClick={() =>
              prepareAndClaim({
                account: row.original.walletAddress as `0x${string}`,
                currencySymbol,
                currencyParam: currencySymbol,
              })
            }
            title="Claim to this wallet"
          >
            <HandCoins className="w-4 h-4" />
            Claim
          </button>
        ) : null}
      </div>
    );
  },
  enableSorting: true,
},
  ];
}

export const legendsColumns: ColumnDef<LegendRow>[] = makeLegendsColumns("ETN");
