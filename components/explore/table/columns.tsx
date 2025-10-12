// components/explore/table/columns.tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ApiCollection } from "../explore-collections";

function num(v: number | null | undefined) {
  return v == null ? "-" : Intl.NumberFormat().format(v);
}
function money(v: number | null | undefined, symbol: string) {
  if (v == null) return <div className="text-right">-</div>;
  return (
    <div className="w-full flex items-center justify-end gap-1">
      {Intl.NumberFormat().format(v)}
      <span className="text-[10px] px-1 py-[1px] rounded border border-border text-muted-foreground">{symbol}</span>
    </div>
  );
}
function pct(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return <span className="text-muted-foreground">-</span>;
  const s = v.toFixed(2) + "%";
  if (v > 0) return <span className="text-green-500">{s}</span>;
  if (v < 0) return <span className="text-red-500">{s}</span>;
  return <span className="text-muted-foreground">{s}</span>;
}

export const columns: ColumnDef<ApiCollection>[] = [
  {
    header: "#",
    cell: ({ row }) => <span className="opacity-70">{row.index + 1}</span>,
    size: 50,
  },
  {
    header: "COLLECTION",
    accessorKey: "name",
    cell: ({ row }) => {
      const r = row.original;
      const isLive = r.sale?.isActive;
      const phase = r.sale?.activePhase;
      const href = isLive ? `/minting-now/${r.contract}` : `/collections/${r.contract}`;

      return (
        <Link href={href} className="flex items-center gap-3 group">
          <div className="relative w-10 h-10 rounded-md overflow-hidden ring-1 ring-border/40 bg-muted">
            {!!r.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.logoUrl} alt={r.name} className="w-full h-full object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate max-w-[22rem] group-hover:underline">
                {r.name}
              </span>
              {isLive && (
                <Badge className="bg-muted-foreground text-[10px] uppercase tracking-wide">
                  {phase === "presale" ? "Presale live" : "Public sale live"}
                </Badge>
              )}
            </div>
          </div>
        </Link>
      );
    },
  },
  {
    header: () => <div className="text-right w-full">FLOOR</div>,
    accessorKey: "floorPrice",
    cell: ({ row }) => money(row.original.floorPrice, row.original.currency?.symbol ?? "ETN"),
  },
  {
    header: () => <div className="text-right w-full">VOLUME</div>,
    accessorKey: "windowVolume",
    cell: ({ row }) => money(row.original.windowVolume ?? 0, row.original.currency?.symbol ?? "ETN"),
  },
  {
    header: () => <div className="text-right w-full">CHANGE</div>,
    accessorKey: "windowChange",
    cell: ({ row }) => <div className="text-right">{pct(row.original.windowChange)}</div>,
  },
  {
    header: () => <div className="text-right w-full">ITEMS</div>,
    accessorKey: "items",
    cell: ({ row }) => <div className="text-right">{num(row.original.items)}</div>,
  },
  {
    header: () => <div className="text-right w-full">OWNERS</div>,
    accessorKey: "owners",
    cell: ({ row }) => <div className="text-right">{num(row.original.owners)}</div>,
  },
];
