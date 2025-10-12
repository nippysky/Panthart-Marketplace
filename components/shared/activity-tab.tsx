"use client";

import React, { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  BsFillTagFill,
  BsLightningFill,
  BsArrowUpRight,
  BsArrowDownLeft,
} from "react-icons/bs";
import { FaTrashAlt, FaGavel } from "react-icons/fa";
import { MdAddCircle } from "react-icons/md";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

export type NFTActivity = {
  id: string;
  type: string;
  fromAddress: string;
  toAddress: string;
  price: number | null;
  timestamp: string;
  txHash: string;
  marketplace?: string | null;
};

interface ActivityTabProps {
  contract: string;
  tokenId: string;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Listing: <BsFillTagFill size={16} />,
  Sale: <BsLightningFill size={16} />,
  Transfer: <BsArrowUpRight size={16} />,
  Unlisting: <FaTrashAlt size={16} />,
  Bid: <FaGavel size={16} />,
  Mint: <MdAddCircle size={16} />,
};

const normalizeType = (raw: string) => {
  const t = raw?.toUpperCase?.() ?? raw;
  switch (t) {
    case "SALE":
      return "Sale";
    case "LISTING":
      return "Listing";
    case "UNLISTING":
      return "Unlisting";
    case "TRANSFER":
      return "Transfer";
    case "BID":
      return "Bid";
    case "MINT":
      return "Mint";
    default:
      return raw || "Transfer";
  }
};

const short = (addr?: string) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";

export default function ActivityTab({ contract, tokenId }: ActivityTabProps) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const { data = [], isFetching, refetch } = useQuery<NFTActivity[], Error>({
    queryKey: ["activities", contract, tokenId],
    queryFn: async () => {
      const res = await fetch(
        `/api/nft/${contract}/${tokenId}/activities?limit=40`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to fetch activities");
      const out = (await res.json()) as NFTActivity[];
      return out.map((a) => ({ ...a, type: normalizeType(a.type) }));
    },
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
  });

  const types = useMemo(
    () => Array.from(new Set(data.map((a) => a.type).filter(Boolean))).sort(),
    [data]
  );

  const filtered = activeFilter ? data.filter((a) => a.type === activeFilter) : data;

  return (
    <section className="w-full flex flex-col-reverse lg:flex-row gap-8">
      {/* activity list */}
      <div className="w-full lg:w-2/3 space-y-3">
        {isFetching && (
          <p className="text-center text-xs text-muted-foreground">Updating…</p>
        )}

        {filtered.length > 0 ? (
          filtered.map((act) => {
            const when = formatDistanceToNow(new Date(act.timestamp), {
              addSuffix: true,
            });
            return (
              <div
                key={act.id}
                className="rounded-xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/[0.04] p-3 sm:p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  {/* icon */}
                  <div className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-black/10 dark:bg-white/10">
                    {ICON_MAP[act.type] ?? <BsArrowDownLeft size={16} />}
                  </div>

                  {/* main content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{act.type}</span>
                      {act.price != null && (
                        <span className="text-sm">
                          for{" "}
                     <span className="font-semibold">
  {act.price} {(act as any).currencySymbol ?? "ETN"}
</span>

                        </span>
                      )}
                      {act.marketplace && (
                        <span className="text-xs text-muted-foreground">
                          • via {act.marketplace}
                        </span>
                      )}
                    </div>

                    {/* addresses (responsive) */}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {/* compact on mobile */}
                      <span className="sm:hidden font-mono">
                        {short(act.fromAddress)} → {short(act.toAddress)}
                      </span>
                      {/* slightly expanded on ≥sm */}
                      <span className="hidden sm:inline font-mono">
                        {act.fromAddress
                          ? `${act.fromAddress.slice(0, 6)}…${act.fromAddress.slice(-4)}`
                          : ""}
                        {" → "}
                        {act.toAddress
                          ? `${act.toAddress.slice(0, 6)}…${act.toAddress.slice(-4)}`
                          : ""}
                      </span>
                    </div>

                    {/* time shown inside content on mobile */}
                    <div className="sm:hidden text-[11px] opacity-70 mt-0.5">
                      {when}
                    </div>
                  </div>

                  {/* right rail: time + link (always visible) */}
                  <div className="shrink-0 flex items-center justify-end gap-3 sm:gap-2">
                    <span className="hidden sm:block text-[11px] opacity-70 whitespace-nowrap">
                      {when}
                    </span>
                    <Link
                      href={`https://blockexplorer.electroneum.com/tx/${act.txHash}`}
                      target="_blank"
                      className="text-xs text-brandsec dark:text-brand hover:underline whitespace-nowrap"
                    >
                      View Tx
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-16 rounded-xl border border-black/10 dark:border-white/10">
            <p className="mb-4 text-sm">No activity found.</p>
            <Button variant="outline" onClick={() => refetch()}>
              Refresh
            </Button>
          </div>
        )}
      </div>

      {/* filters */}
      <aside className="w-full lg:w-1/3">
        <h3 className="mb-3 font-semibold">Filter by Type</h3>
        <div className="flex flex-wrap gap-2">
          {types.map((opt) => (
            <Button
              key={opt}
              variant={activeFilter === opt ? "default" : "outline"}
              size="sm"
              className="flex items-center gap-1"
              onClick={() => setActiveFilter((f) => (f === opt ? null : opt))}
            >
              {ICON_MAP[opt] ?? null}
              {opt}
            </Button>
          ))}
        </div>
        {activeFilter && (
          <Button
            variant="link"
            size="sm"
            className="mt-4 text-xs"
            onClick={() => setActiveFilter(null)}
          >
            Reset filter
          </Button>
        )}
      </aside>
    </section>
  );
}
