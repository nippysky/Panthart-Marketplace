"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import LegendsMobileCards from "./mobile/legends-mobile-cards";
import LegendsTable from "./table/legends-table";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type LegendRow = {
  rank: number;
  userId: string;
  walletAddress: string;
  username: string;
  profileAvatar: string | null;
  comrades: number;
  feeShareHuman: number;
  feeShareWei: string;
};

type LegendsResponse = {
  holders: LegendRow[];
  nextOffset: number | null;
  totalComrades: number;
  currency: { id: string; symbol: string; decimals: number; kind: "NATIVE" | "ERC20"; tokenAddress: string | null };
  poolDistributedHuman: number;
  poolDistributedWei: string;
  accPerToken1e27: string;
};

type ActiveCurrency = {
  id: string;
  symbol: string;
  decimals: number;
  kind: "NATIVE" | "ERC20";
  tokenAddress: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const PAGE = 25;

export default function PanthartLegends() {
  // Currencies for dropdown
  const { data: currenciesRes, isLoading: currenciesLoading } = useSWR<{ items: ActiveCurrency[] }>(
    "/api/currencies/active",
    fetcher,
    { revalidateOnFocus: false }
  );

  const defaultCurrency = useMemo(() => {
    const list = currenciesRes?.items || [];
    return list.find((c) => c.symbol.toUpperCase() === "ETN") || list[0];
  }, [currenciesRes]);

  const [currency, setCurrency] = useState<string>(defaultCurrency?.symbol || "ETN");
  useEffect(() => {
    if (defaultCurrency?.symbol) setCurrency(defaultCurrency.symbol);
  }, [defaultCurrency?.symbol]);

  // Legends pagination
  const getKey = (index: number, prev: LegendsResponse | null) => {
    if (prev && prev.nextOffset == null) return null;
    const offset = index === 0 ? 0 : prev?.nextOffset ?? 0;
    return `/api/legends?limit=${PAGE}&offset=${offset}&currency=${encodeURIComponent(currency)}`;
  };

  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite<LegendsResponse>(
    getKey,
    fetcher,
    {
      revalidateFirstPage: true,
      persistSize: true,
      refreshInterval: 15_000,
      revalidateOnFocus: true,
    }
  );

  const pages = data ?? [];
  const holders: LegendRow[] = pages.flatMap((p) => p.holders ?? []);
  const hasMore = pages.length === 0 ? false : pages[pages.length - 1]?.nextOffset != null;
  const header = pages[0];

  // IMPORTANT: show table skeleton while first page is fetching
  const firstPageLoading = (pages.length === 0) && (isLoading || isValidating);

  // Reset pagination when currency changes
  useEffect(() => {
    setSize(0).then(() => setSize(1));
  }, [currency, setSize]);

  // Mobile infinite scroll
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

  const currencyList = currenciesRes?.items || [];
  const selectedCurrency = currencyList.find((c) => c.symbol === currency || c.tokenAddress === currency);
  const currencySymbol = selectedCurrency?.symbol || header?.currency?.symbol || "ETN";

  return (
    <section className="flex-1 mb-20">
      {/* Header & controls */}
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Panthart Legends</h2>
            <p className="text-sm text-muted-foreground">
              Live leaderboard of <b>Non-Fungible Comrades</b> holders. Rewards are distributed per currency via
              the RewardsDistributor and EIP-712 claims.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-wide opacity-70">Currency</label>
            {currenciesLoading ? (
              <Skeleton className="h-9 w-40 rounded-md" />
            ) : (
              <Select value={currency} onValueChange={(v) => setCurrency(v)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Active</SelectLabel>
                    {currencyList.map((c) => {
                      // value can be symbol (native) or tokenAddress (erc20) for API flexibility
                      const val = c.kind === "ERC20" && c.tokenAddress ? c.tokenAddress : c.symbol;
                      return (
                        <SelectItem key={c.id} value={val}>
                          {c.symbol}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Pool info */}
        <div className="text-sm text-muted-foreground">
          {header ? (
            <>
              Current pool distributed (<b>{currencySymbol}</b>):{" "}
              <b>{Intl.NumberFormat().format(header.poolDistributedHuman ?? 0)}</b>
            </>
          ) : (
            <Skeleton className="h-4 w-64" />
          )}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        {firstPageLoading ? (
          <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-12 gap-3 py-4 px-4 border-t first:border-t-0 border-black/5 dark:border-white/5"
              >
                <Skeleton className="h-5 w-8 col-span-1" />
                <div className="col-span-4 flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24 mt-2" />
                  </div>
                </div>
                <Skeleton className="h-5 w-60 col-span-3" />
                <Skeleton className="h-5 w-20 col-span-2" />
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
            <LegendsTable data={holders} currencySymbol={currencySymbol} />
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

      {/* Mobile cards */}
      <div className="lg:hidden">
        <LegendsMobileCards
          items={holders}
          isLoading={firstPageLoading}
          currencySymbol={currencySymbol}
        />
        {holders.length > 0 && <div ref={loadMoreRef} className="h-10" />}
      </div>
    </section>
  );
}
