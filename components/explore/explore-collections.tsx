// components/explore/explore-collections.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import useSWR from "swr";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "./table/data-table";
import { CollectionsMobileCards } from "./mobile/collections-mobile-cards";
import { SkeletonRow } from "./table/skeleton-row";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";

/* -------------------------- Types (extended) -------------------------- */

type SortBy = "volumeDesc" | "volumeAsc" | "supplyDesc" | "supplyAsc";

export type ApiCollection = {
  id: string;
  name: string;
  contract: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  volume: number | null;              // all-time (native snapshot)
  supply: number | null;
  floorPrice: number | null;          // currency-aware (computed)
  items: number;
  owners: number;

  // dynamic window (currency-aware)
  windowVolume: number;
  windowChange: number | null;
  windowLabel: string;

  // selected currency meta
  currency: { id?: string; symbol: string; decimals: number; kind: "NATIVE" | "ERC20" };

  sale?: { isActive: boolean; activePhase: "presale" | "public" | null };
  isFullyIndexed?: boolean;
};

/* ------------------------------ Helpers ------------------------------ */

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());
const PAGE_SIZE = 25;

// debounce helper
function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay = 300) {
  const t = useRef<NodeJS.Timeout | null>(null);
  return (...args: Parameters<T>) => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => fn(...args), delay);
  };
}

// Only expose these three in the UI
const WINDOW_CHIPS = ["24h", "7d", "30d"] as const;

/* ----------------------------- Component ----------------------------- */

export default function ExploreCollections() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // read from URL (default empty for inputs)
  const urlSearch   = searchParams.get("search")     ?? "";
  const urlMinVol   = searchParams.get("minVolume")  ?? "";
  const urlMinItems = searchParams.get("minItems")   ?? "";
  const urlSort     = (searchParams.get("sortBy") as SortBy) ?? "volumeDesc";
  const urlWindow   = (searchParams.get("window") ?? "24h").toLowerCase();
  const urlCurrency = (searchParams.get("currency") ?? "native").toLowerCase();

  // local state
  const [search, setSearch]         = useState(urlSearch);
  const [minVolume, setMinVolume]   = useState(urlMinVol);
  const [minItems, setMinItems]     = useState(urlMinItems);
  const [sortBy, setSortBy]         = useState<SortBy>(urlSort);
  const [windowSel, setWindowSel]   = useState<string>(urlWindow);
  const [currency, setCurrency]     = useState<string>(urlCurrency); // "native" | currencyId

  useEffect(() => setSearch(urlSearch),    [urlSearch]);
  useEffect(() => setMinVolume(urlMinVol), [urlMinVol]);
  useEffect(() => setMinItems(urlMinItems),[urlMinItems]);
  useEffect(() => setSortBy(urlSort),      [urlSort]);
  useEffect(() => setWindowSel(urlWindow), [urlWindow]);
  useEffect(() => setCurrency(urlCurrency),[urlCurrency]);

  // active currencies (with native de-dup)
  const { data: currenciesData } = useSWR<{ items: Array<{ id: string; symbol: string; decimals: number; kind: string; tokenAddress?: string | null }> }>(
    "/api/currencies/active",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 300_000 }
  );

  const currencyOptions = React.useMemo(() => {
    const items = currenciesData?.items ?? [];
    const seen = new Set<string>();
    const deduped: Array<{ id?: string; value: string; label: string; kind: "NATIVE" | "ERC20"; decimals: number }> = [];

    // Always include native once
    deduped.push({ value: "native", label: "ETN (native)", kind: "NATIVE", decimals: 18 });

    for (const c of items) {
      const isNative = (c.kind || "").toUpperCase() === "NATIVE";
      if (isNative) continue; // avoid duplicate ETN native entries
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      deduped.push({
        id: c.id,
        value: c.id,
        label: c.symbol,
        kind: "ERC20",
        decimals: c.decimals ?? 18,
      });
    }
    return deduped;
  }, [currenciesData]);

  const replaceUrl = (next: Partial<{ search: string; minVolume: string; minItems: string; sortBy: SortBy; window: string; currency: string }>) => {
    const params = new URLSearchParams(searchParams.toString());
    const apply = (k: string, v: string | undefined, removeWhenEmpty = true) => {
      const value = v ?? "";
      if (removeWhenEmpty && value.trim() === "") params.delete(k);
      else params.set(k, value);
    };
    apply("search", next.search ?? search);
    apply("minVolume", next.minVolume ?? minVolume);
    apply("minItems", next.minItems ?? minItems);
    params.set("sortBy", (next.sortBy ?? sortBy) as string);
    params.set("window", (next.window ?? windowSel) as string);
    params.set("currency", (next.currency ?? currency) as string);

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const debouncedReplace = useDebouncedCallback(replaceUrl, 350);

  // change handlers
  const onSearchChange   = (v: string) => { setSearch(v);       debouncedReplace({ search: v }); };
  const onMinVolChange   = (v: string) => { const c = v.replace(/[^\d.]/g, ""); setMinVolume(c); debouncedReplace({ minVolume: c }); };
  const onMinItemsChange = (v: string) => { const c = v.replace(/[^\d]/g, "");  setMinItems(c);  debouncedReplace({ minItems: c }); };
  const onSortChange     = (v: SortBy)   => { setSortBy(v);     replaceUrl({ sortBy: v }); };
  const onWindowChange   = (v: string)   => { setWindowSel(v);  replaceUrl({ window: v }); };
  const onCurrencyChange = (v: string)   => { setCurrency(v);   replaceUrl({ currency: v }); };

  // SWR key/query
  const qsBase = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(PAGE_SIZE));
    p.set("window", windowSel || "24h");
    p.set("currency", currency || "native");
    if (search.trim()) p.set("search", search.trim());
    if (minVolume.trim() && Number(minVolume) > 0) p.set("minVolume", String(Number(minVolume)));
    if (minItems.trim() && Number(minItems) > 0) p.set("minSupply", String(Number(minItems)));
    if (sortBy) p.set("sortBy", sortBy);
    return p.toString();
  }, [search, minVolume, minItems, sortBy, windowSel, currency]);

  const getKey = (pageIndex: number, previousPageData: any) => {
    if (previousPageData && !previousPageData.nextCursor) return null;
    const params = new URLSearchParams(qsBase);
    if (pageIndex > 0 && previousPageData?.nextCursor) {
      params.set("cursor", previousPageData.nextCursor);
    }
    return `/api/collections?${params.toString()}`;
  };

  const { data, isLoading, size, setSize, isValidating } = useSWRInfinite(getKey, fetcher, {
    revalidateFirstPage: true,
    persistSize: true,
    refreshInterval: 180_000, // 3 minutes
    revalidateOnFocus: true,
  });

  const pages = data ?? [];
  const rows: ApiCollection[] = pages.flatMap((p) => p.collections ?? []);

  // 🔢 Ensure ranking is by highest window volume (selected window/currency)
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (b.windowVolume ?? 0) - (a.windowVolume ?? 0)),
    [rows]
  );

  const hasMore = pages.length === 0 ? false : Boolean(pages[pages.length - 1]?.nextCursor);

  const resetFilters = () => {
    setSearch(""); setMinVolume(""); setMinItems("");
    setSortBy("volumeDesc"); setWindowSel("24h"); setCurrency("native");
    router.replace(pathname, { scroll: false });
  };

  // auto-load sentinel
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setSize((s) => s + 1);
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, setSize]);

  const activeSymbol = sortedRows[0]?.currency?.symbol ?? "ETN";
  const overlayActive = isLoading || isValidating;

  return (
    <section className="flex-1 mb-20 relative">
      {/* Toolbar (Desktop) */}
      <div className="hidden lg:grid grid-cols-12 gap-3 mb-4 items-center">
        <div className="col-span-4">
          <Input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Collection name..." />
        </div>

        {/* Currency */}
        <div className="col-span-2">
          <Select value={currency} onValueChange={onCurrencyChange}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Currency" /></SelectTrigger>
            <SelectContent>
              {currencyOptions.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2">
          <Input value={minVolume} onChange={(e) => onMinVolChange(e.target.value)} inputMode="decimal" placeholder={`Min Volume (${activeSymbol})`} />
        </div>
        <div className="col-span-2">
          <Input value={minItems} onChange={(e) => onMinItemsChange(e.target.value)} inputMode="numeric" placeholder="Min Items" />
        </div>

        {/* Window chips (24h/7d/30d) */}
        <div className="col-span-2 flex items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {WINDOW_CHIPS.map((w) => (
              <button
                key={w}
                onClick={() => onWindowChange(w)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs border transition",
                  windowSel === w
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-foreground/70 border-border hover:bg-muted"
                )}
              >
                {w.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Sort + Reset */}
        <div className="col-span-2 flex gap-2">
          <Select value={sortBy} onValueChange={(v: SortBy) => onSortChange(v)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Sort By" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="volumeDesc">Volume ↓</SelectItem>
              <SelectItem value="volumeAsc">Volume ↑</SelectItem>
              <SelectItem value="supplyDesc">Items ↓</SelectItem>
              <SelectItem value="supplyAsc">Items ↑</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={resetFilters}>Reset</Button>
        </div>
      </div>

      {/* Mobile filters (collapsible) */}
      <div className="lg:hidden mb-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-2">
              <MagnifyingGlassIcon /> Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="space-y-4 px-4">
            <SheetHeader><SheetTitle>Filter Collections</SheetTitle></SheetHeader>

            <Input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Collection name..." />

            <Select value={currency} onValueChange={onCurrencyChange}>
              <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
              <SelectContent>
                {currencyOptions.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input value={minVolume} onChange={(e) => onMinVolChange(e.target.value)} inputMode="decimal" placeholder={`Min Volume (${activeSymbol})`} />
            <Input value={minItems}  onChange={(e) => onMinItemsChange(e.target.value)} inputMode="numeric" placeholder="Min Items" />

            <div className="flex flex-wrap gap-2 pt-1">
              {WINDOW_CHIPS.map((w) => (
                <Button
                  key={w}
                  variant={windowSel === w ? "default" : "outline"}
                  size="sm"
                  onClick={() => onWindowChange(w)}
                >
                  {w.toUpperCase()}
                </Button>
              ))}
            </div>

            <Select value={sortBy} onValueChange={(v: SortBy) => onSortChange(v)}>
              <SelectTrigger><SelectValue placeholder="Sort By" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="volumeDesc">Volume ↓</SelectItem>
                <SelectItem value="volumeAsc">Volume ↑</SelectItem>
                <SelectItem value="supplyDesc">Items ↓</SelectItem>
                <SelectItem value="supplyAsc">Items ↑</SelectItem>
              </SelectContent>
            </Select>

            <div className="pt-2">
              <Button variant="outline" className="w-full" onClick={resetFilters}>Reset</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block relative">
        {isLoading && sortedRows.length === 0 ? (
          <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden">
            <SkeletonRow rows={8} />
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="rounded-xl border border-black/10 dark:border-white/10 p-8 text-sm text-muted-foreground">
            No collections match your filters.
          </div>
        ) : (
          <>
            <div className={cn((isLoading || isValidating) && "opacity-40 blur-[1px] pointer-events-none transition")}>
              <DataTable data={sortedRows} />
            </div>

            {(isLoading || isValidating) && (
              <div className="absolute inset-0 z-10 rounded-xl border border-transparent bg-background/70 backdrop-blur-sm">
                <div className="p-0">
                  <SkeletonRow rows={6} />
                </div>
              </div>
            )}

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
      <div className="lg:hidden relative">
        <div className={cn((isLoading || isValidating) && "opacity-40 blur-[1px] pointer-events-none transition")}>
          <CollectionsMobileCards
            items={sortedRows}
            isLoading={isLoading && sortedRows.length === 0}
            windowLabel={sortedRows[0]?.windowLabel ?? windowSel.toUpperCase()}
          />
          {sortedRows.length > 0 && <div ref={loadMoreRef} className="h-10" />}
        </div>

        {(isLoading || isValidating) && (
          <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-sm rounded-lg p-3">
            <SkeletonRow rows={4} />
          </div>
        )}
      </div>
    </section>
  );
}
