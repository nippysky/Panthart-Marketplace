// components/explore/legends/index.tsx
"use client";

/**
 * Panthart Legends
 * Desktop: shadcn table (TanStack) with infinite scroll button
 * Mobile: ranked cards (1,2,3…) + auto-load sentinel
 * Live updates via SWR refreshInterval
 */

import React, { useEffect, useRef } from "react";
import useSWRInfinite from "swr/infinite";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import LegendsMobileCards from "./mobile/legends-mobile-cards";
import LegendsTable from "./table/legends-table";

export type LegendRow = {
  rank: number;
  userId: string;
  walletAddress: string;
  username: string;
  profileAvatar: string | null;
  comrades: number;
  feeShareEtn: number;
  feeShareWei: string;
};

type LegendsResponse = {
  holders: LegendRow[];
  nextOffset: number | null;
  totalComrades: number;
  poolEtn: number;
  poolWei: string;
  shareRate: number; // 0.015 (1.5%)
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PAGE = 25;

export default function PanthartLegends() {
  const getKey = (index: number, prev: LegendsResponse | null) => {
    if (prev && prev.nextOffset == null) return null;
    const offset = index === 0 ? 0 : prev?.nextOffset ?? 0;
    return `/api/legends?limit=${PAGE}&offset=${offset}`;
  };

  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite<LegendsResponse>(
    getKey,
    fetcher,
    {
      revalidateFirstPage: true,
      persistSize: true,
      refreshInterval: 15_000, // live-ish
      revalidateOnFocus: true,
    }
  );

  const pages = data ?? [];
  const holders: LegendRow[] = pages.flatMap((p) => p.holders ?? []);
  const hasMore = pages.length === 0 ? false : pages[pages.length - 1]?.nextOffset != null;

  // Auto-load on mobile using sentinel
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && setSize((s) => s + 1),
      { rootMargin: "700px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, setSize]);

  const header = pages[0];

  return (
    <section className="flex-1 mb-20">
      {/* Context header */}
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Panthart Legends</h2>
        <p className="text-sm text-muted-foreground">
          Live leaderboard of <b>Non-Fungible Comrades</b> holders. Holders passively share
          <b> {(header?.shareRate ?? 0.015) * 100}%</b> of marketplace fees. Pool so far:{" "}
          <b>{Intl.NumberFormat().format(header?.poolEtn ?? 0)} ETN</b>.
        </p>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        {isLoading && holders.length === 0 ? (
          <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden">
            {/* simple skeleton for 8 rows */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-12 gap-3 py-4 px-4 border-t first:border-t-0 border-black/5 dark:border-white/5">
                <Skeleton className="h-5 w-8 col-span-1" />
                <Skeleton className="h-6 w-48 col-span-4" />
                <Skeleton className="h-5 w-56 col-span-3" />
                <Skeleton className="h-5 w-24 col-span-2" />
                <Skeleton className="h-5 w-28 col-span-2" />
              </div>
            ))}
          </div>
        ) : holders.length === 0 ? (
          <div className="rounded-xl border border-black/10 dark:border-white/10 p-8 text-sm text-muted-foreground">
            No holders yet.
          </div>
        ) : (
          <>
            <LegendsTable data={holders} />
            <div className="mt-4 flex justify-center">
              {hasMore ? (
                <Button onClick={() => setSize(size + 1)} disabled={isValidating}>
                  {isValidating ? "Loading…" : "Load more"}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">No more results.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Mobile cards (with auto-load sentinel) */}
      <div className="lg:hidden">
        <LegendsMobileCards items={holders} isLoading={isLoading && holders.length === 0} />
        {holders.length > 0 && <div ref={loadMoreRef} className="h-10" />}
      </div>
    </section>
  );
}
