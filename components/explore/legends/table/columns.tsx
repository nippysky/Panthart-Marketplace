// components/explore/legends/table/columns.tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";
import Link from "next/link";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { LegendRow } from "../index";
import { getBadgeForCount } from "@/lib/legends/badges";

const EXPLORER =
  process.env.NEXT_PUBLIC_BLOCK_EXPLORER ||
  "https://blockexplorer.electroneum.com";

export const legendsColumns: ColumnDef<LegendRow>[] = [
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
      const badge = getBadgeForCount(u.comrades);
      return (
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-full overflow-hidden bg-muted">
            {u.profileAvatar ? (
              <Image
                src={u.profileAvatar}
                alt={u.username}
                fill
                className="object-cover"
                unoptimized
              />
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
            </div>
            <div className="text-xs text-muted-foreground">{badge.name}</div>
          </div>
        </div>
      );
    },
  },
  {
    header: "Wallet",
    accessorKey: "walletAddress",
    cell: ({ row }) => {
      const u = row.original;
      const addr = u.walletAddress;
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
    cell: ({ row }) => (
      <div className="font-semibold">{row.original.comrades}</div>
    ),
    enableSorting: true,
    size: 120,
  },
  {
    header: () => <div className="text-right w-full">Fee Accumulated</div>,
    accessorKey: "feeShareEtn",
    cell: ({ row }) => {
      const v = row.original.feeShareEtn;
      return (
        <div className="w-full flex items-center justify-end gap-1 font-semibold">
          {Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(v)}
          <Image src="/ETN_LOGO.png" alt="ETN" width={14} height={14} />
        </div>
      );
    },
    enableSorting: true,
  },
];
