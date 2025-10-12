"use client";

/**
 * TopCollections
 * - ranks by selected-window volume (DESC), consistent with Explore
 * - defensive client-side sort (even though API is sorted)
 * - 3-minute refresh to match Explore
 * - window chips trimmed to 24h / 7d / 30d
 */

import React from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { MoveRight } from "lucide-react";
import TopCollectionCard from "@/components/collection/top-collection-card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectValue, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* -------------------------------- Types -------------------------------- */

type SaleInfo = { isActive: boolean; activePhase: "presale" | "public" | null };
type CurrencyMeta = { id?: string; symbol: string; decimals: number; kind: "NATIVE" | "ERC20" };
type TopItem = {
  id: string; name: string; contract: string; logoUrl: string | null; coverUrl: string | null;
  floor: number | null; floorBase: string | null;
  volumeWindow: number; volumePrevWindow: number; changePct: number; volumeAllTime: number;
  sale: SaleInfo; isFullyIndexed: boolean; isSoldOut: boolean; currency: CurrencyMeta;
};

type WindowKey = "24h" | "7d" | "30d";

/* ------------------------------- Helpers ------------------------------- */

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

const WINDOW_OPTS: { key: WindowKey; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d",  label: "7d"  },
  { key: "30d", label: "30d" },
];

/* ------------------------------ Component ------------------------------ */

export default function TopCollections({ initialCollections = [] as TopItem[] }) {
  const [windowKey, setWindowKey] = React.useState<WindowKey>("24h");
  const [currencyId, setCurrencyId] = React.useState<string>("native");

  // currencies
  const { data: currenciesData } = useSWR<{ items: Array<{ id: string; symbol: string; decimals: number; kind: "NATIVE" | "ERC20" | string; tokenAddress: string | null }> }>(
    "/api/currencies/active",
    fetcher,
    { refreshInterval: 5 * 60_000, keepPreviousData: true as any }
  );

  const currencyOptions = React.useMemo(() => {
    const active = currenciesData?.items ?? [];
    const filtered = active.filter((c) => String(c.kind).toUpperCase() !== "NATIVE" && String(c.symbol).toUpperCase() !== "ETN");
    return [{ id: "native", symbol: "ETN", decimals: 18, kind: "NATIVE" as const }, ...filtered];
  }, [currenciesData]);

  // data
  const KEY = `/api/collections/top?window=${windowKey}&currency=${currencyId}`;
  const { data, isLoading, isValidating } = useSWR<{ collections: TopItem[] }>(KEY, fetcher, {
    refreshInterval: 180_000,
    revalidateOnFocus: true,
    keepPreviousData: true as any,
    fallbackData: { collections: initialCollections },
  });

  const raw = data?.collections ?? [];
  const collections = React.useMemo(() => [...raw].sort((a, b) => (b.volumeWindow ?? 0) - (a.volumeWindow ?? 0)), [raw]);

  const showOverlay = isLoading || isValidating;

  React.useEffect(() => {
    const bc = typeof window !== "undefined" ? new BroadcastChannel("panthart-mints") : null;
    const handler = () => mutate(KEY);
    bc?.addEventListener("message", handler);
    const h2 = () => mutate(KEY);
    window.addEventListener("nft:minted", h2 as any);
    window.addEventListener("sale:state-changed", h2 as any);
    return () => {
      bc?.removeEventListener("message", handler);
      bc?.close();
      window.removeEventListener("nft:minted", h2 as any);
      window.removeEventListener("sale:state-changed", h2 as any);
    };
  }, [KEY]);

  const SkeletonRow = ({ i }: { i: number }) => (
    <div key={`sk-${i}`} className="w-full flex justify-between items-center gap-4 sm:gap-10 my-5 p-5 border-b rounded-md">
      <div className="w-[70%] flex gap-3 items-center min-w-0">
        <span className="w-5"><div className="h-4 w-3 bg-muted animate-pulse rounded" /></span>
        <div className="relative w-16 h-16 rounded-md overflow-hidden bg-muted animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 bg-muted animate-pulse rounded" />
          <div className="h-3 w-24 bg-muted animate-pulse rounded" />
          <div className="h-3 w-28 bg-muted animate-pulse rounded" />
        </div>
      </div>
      <div className="w-[30%] flex justify-end">
        <div className="space-y-2 w-28">
          <div className="h-4 w-full bg-muted animate-pulse rounded" />
          <div className="h-3 w-20 bg-muted animate-pulse rounded ml-auto" />
        </div>
      </div>
    </div>
  );

  const slots = Array.from({ length: 10 }, (_, i) => i);
  const renderSlot = (i: number) => {
    const c = collections[i];
    if (!c) {
      return (
        <div key={`empty-${i}`} className="w-full flex items-center justify-between py-6 border-b border-border text-muted-foreground px-2 sm:px-3 lg:px-4 text-sm cursor-default">
          <div className="flex items-center gap-4">
            <span className="text-sm w-5">{i + 1}</span>
            <span className="text-lg font-medium">-</span>
          </div>
        </div>
      );
    }

    const pct = Number.isFinite(c.changePct) ? c.changePct : 0;
    const percentage = `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
    const status = pct > 0 ? "increase" : pct < 0 ? "decrease" : ("neutral" as const);
    const symbol = c.currency?.symbol ?? "ETN";
    const vol = c.volumeWindow ?? 0;
    const floor = c.floor ?? 0;
    const path = !c.isSoldOut && c.sale?.isActive ? `/minting-now/${c.contract}` : `/collections/${c.contract}`;
    const salePhase = !c.isSoldOut && c.sale?.isActive ? c.sale.activePhase : null;

    return (
      <TopCollectionCard
        key={c.id}
        collectionID={i + 1}
        name={c.name}
        floorPrice={floor}
        volume={vol}
        percentage={percentage}
        percentageStatus={status}
        collectionImg={c.logoUrl}
        currencySymbol={symbol}
        path={path}
        salePhase={salePhase}
      />
    );
  };

  return (
    <section className="w-full flex flex-col justify-center py-20">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="font-bold text-[1.2rem] lg:text-[2rem]">Top Collections</h1>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center gap-1">
              {WINDOW_OPTS.map((opt) => {
                const active = opt.key === windowKey;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setWindowKey(opt.key)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      active ? "border-brand/60 bg-brand/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40"
                    )}
                    aria-pressed={active}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-[180px]">
            <Select value={currencyId} onValueChange={(v) => setCurrencyId(v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Currency" /></SelectTrigger>
              <SelectContent>
                {currencyOptions.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.symbol} {c.id === "native" ? "(native)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Link href="/collections">
            <Button variant="link" className="flex items-center gap-2 font-bold">
              See All Collections
              <MoveRight />
            </Button>
          </Link>
        </div>
      </div>

      <div className="relative mt-5">
        <section className={cn("grid grid-cols-1 lg:grid-cols-2 gap-10 transition-all duration-200", (isLoading || isValidating) && "opacity-30 blur-[1px] saturate-0")} aria-busy={isLoading || isValidating}>
          {slots.map((i) => renderSlot(i))}
        </section>

        {(isLoading || isValidating) && (
          <div className={cn("pointer-events-none absolute inset-0 rounded-md", "bg-background/95 backdrop-blur-sm transition-opacity duration-150 opacity-100")}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 p-0">
              {slots.map((i) => (<SkeletonRow key={`ovl-${i}`} i={i} />))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
