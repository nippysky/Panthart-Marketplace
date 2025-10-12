"use client";

import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { useInfiniteQuery, QueryFunctionContext, InfiniteData } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { Slash, Loader2, SlidersHorizontal, Funnel } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetHeader,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

import CollectionCard, { DirectoryCollection } from "./collection-card";
import FeaturedCollection from "@/components/home/featured-collection-hero";

/* ───────────────────────────────── Types ───────────────────────────────── */

type PageResponse = {
  collections: DirectoryCollection[];
  nextCursor: string | null;
  currency?: { id?: string; symbol: string; decimals: number; kind: "NATIVE" | "ERC20" };
};

type SortKey = "volumeDesc" | "volumeAsc" | "floorDesc" | "floorAsc" | "itemsDesc" | "itemsAsc";
type WindowKey = "24h" | "7d" | "30d";

/* ─────────────────────────────── Helpers ─────────────────────────────── */

function eqAddr(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  try { return a.toLowerCase() === b.toLowerCase(); } catch { return a === b; }
}

async function fetchFeaturedContract(): Promise<string | null> {
  try {
    const res = await fetch(`/api/featured-collection?limit=1`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.collection?.contract ?? null;
  } catch { return null; }
}

/* ────────────────────────────── Component ────────────────────────────── */

export default function CollectionDirectory() {
  /* state */
  const [search, setSearch] = useState("");
  const [minFloor, setMinFloor] = useState<string>("");
  const [minVolume, setMinVolume] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortKey>("volumeDesc");
  const [windowKey, setWindowKey] = useState<WindowKey>("24h");
  const [currencyId, setCurrencyId] = useState<string>("native");

  const [filtersOpen, setFiltersOpen] = useState(false);

  /* currencies (native + active ERC-20) */
  const { items: currencyOptions = [] } = useCurrencies();

  /* featured */
  const [featuredContract, setFeaturedContract] = useState<string | null>(null);
  const [featuredDetails, setFeaturedDetails] = useState<DirectoryCollection | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const c = await fetchFeaturedContract();
      if (!cancel) setFeaturedContract(c);
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!featuredContract) return;
      try {
        const params = new URLSearchParams();
        params.set("limit", "1");
        params.set("search", featuredContract);
        params.set("currency", currencyId);
        params.set("window", windowKey);
        const res = await fetch(`/api/collections?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const j: PageResponse = await res.json();
        const match = (j.collections || []).find((c) => eqAddr(c.contract, featuredContract));
        if (!cancel) setFeaturedDetails(match ?? null);
      } catch {}
    })();
    return () => { cancel = true; };
  }, [featuredContract, currencyId, windowKey]);

  /* query key */
  const QUERY_KEY = useMemo(
    () =>
      [
        "collections",
        { search: search.trim() || undefined },
        { minFloor: minFloor || undefined },
        { minVolume: minVolume || undefined },
        { sortBy },
        { windowKey },
        { currencyId },
      ] as const,
    [search, minFloor, minVolume, sortBy, windowKey, currencyId]
  );

  /* paging / fetch */
  const { data, isLoading, fetchNextPage, isFetchingNextPage, hasNextPage } =
    useInfiniteQuery<PageResponse, Error, InfiniteData<PageResponse>, typeof QUERY_KEY>({
      queryKey: QUERY_KEY,
      queryFn: async (ctx: QueryFunctionContext<typeof QUERY_KEY>) => {
        const [_, { search }, { minFloor }, { minVolume }, { sortBy }, { windowKey }, { currencyId }] = ctx.queryKey;
        const params = new URLSearchParams();
        params.set("limit", "24");
        params.set("onlyStarted", "1");
        if (ctx.pageParam) params.set("cursor", ctx.pageParam as string);
        if (search) params.set("search", search);
        if (minFloor) params.set("minFloor", String(minFloor));
        if (minVolume) params.set("minVolume", String(minVolume));
        params.set("sortBy", sortBy);
        params.set("window", windowKey);
        params.set("currency", currencyId);
        const res = await fetch(`/api/collections?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load collections");
        return res.json();
      },
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      initialPageParam: undefined,
      staleTime: 20_000,
    });

  const pageCollections = useMemo(() => data?.pages.flatMap((p) => p.collections) ?? [], [data]);

  const gridCollections = useMemo(() => {
    if (!featuredDetails) return pageCollections;
    return pageCollections.filter((c) => !eqAddr(c.contract, featuredDetails.contract));
  }, [pageCollections, featuredDetails]);

  /* infinite scroll */
  const loaderRef = useRef<HTMLDivElement>(null);
  const onIntersect = useCallback(
    ([entry]: IntersectionObserverEntry[]) => { if (entry.isIntersecting && hasNextPage) fetchNextPage(); },
    [fetchNextPage, hasNextPage]
  );
  useEffect(() => {
    const obs = new IntersectionObserver(onIntersect, { rootMargin: "240px" });
    loaderRef.current && obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [onIntersect]);

  const pathname = usePathname();

  /* badge count for mobile */
  const activeCount =
    (search.trim() ? 1 : 0) +
    (minFloor ? 1 : 0) +
    (minVolume ? 1 : 0) +
    (sortBy !== "volumeDesc" ? 1 : 0) +
    (windowKey !== "24h" ? 1 : 0) +
    (currencyId !== "native" ? 1 : 0);

  const resetAll = () => {
    setSearch("");
    setMinFloor("");
    setMinVolume("");
    setSortBy("volumeDesc");
    setWindowKey("24h");
    setCurrencyId("native");
  };

  /* shared class for wrapped buttons (mobile sheet) */
  const wrapBtn =
    "justify-center text-xs sm:text-sm whitespace-normal break-words leading-tight h-auto min-h-[40px] py-2 text-center";

  return (
    <div className="lg:px-10 py-8">
      {/* Breadcrumb */}
      <Breadcrumb className="mb-5">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator><Slash className="w-3.5 h-3.5" /></BreadcrumbSeparator>
          <BreadcrumbItem><BreadcrumbPage>Collections</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Spotlight */}
      <section aria-label="Featured Collection Spotlight" className="mb-8 -mt-1">
        <FeaturedCollection />
      </section>

      {/* Mobile sheet with wrapped buttons */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetTrigger asChild>
            <Button variant="default" className="md:hidden gap-2">
              <Funnel className="h-4 w-4" />
              Filters
              {activeCount > 0 && <Badge variant="secondary" className="ml-1">{activeCount}</Badge>}
            </Button>
          </SheetTrigger>

          <SheetContent side="right" className="w-full sm:max-w-md md:max-w-lg p-0">
            <SheetHeader className="px-6 pt-6">
              <div className="flex items-center justify-between">
                <SheetTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                </SheetTitle>
                <Button variant="ghost" size="sm" onClick={resetAll}>
                  Reset All
                </Button>
              </div>
            </SheetHeader>

            <div className="px-6 pb-28 pt-4 overflow-y-auto h-full">
              <div className="grid gap-6">
                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-semibold mb-3">Search</div>
                  <Input
                    placeholder="Search collections…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-semibold mb-3">Basic filters</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      type="number"
                      placeholder="Min Floor"
                      inputMode="decimal"
                      value={minFloor}
                      onChange={(e) => setMinFloor(e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder="Min Volume"
                      inputMode="decimal"
                      value={minVolume}
                      onChange={(e) => setMinVolume(e.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-semibold mb-3">Sort by</div>
                  <div className="grid grid-cols-2 gap-2">
                    {SORT_OPTIONS.map((s) => (
                      <Button
                        key={s.key}
                        type="button"
                        variant={sortBy === s.key ? "default" : "outline"}
                        className={wrapBtn}
                        onClick={() => setSortBy(s.key)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-semibold mb-3">Metric window</div>
                  <div className="flex flex-wrap gap-2">
                    {WINDOW_OPTIONS.map((w) => (
                      <Button
                        key={w.key}
                        type="button"
                        variant={windowKey === w.key ? "default" : "outline"}
                        onClick={() => setWindowKey(w.key)}
                        className={wrapBtn}
                      >
                        {w.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-semibold mb-3">Currency</div>
                  <div className="flex flex-wrap gap-2">
                    {currencyOptions.map((c) => {
                      const id = String(c.id);
                      const active = currencyId === id;
                      return (
                        <Button
                          key={id}
                          type="button"
                          variant={active ? "default" : "outline"}
                          onClick={() => setCurrencyId(id)}
                          className={wrapBtn}
                          title={c.symbol}
                        >
                          {c.symbol} {id === "native" ? "(native)" : ""}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <SheetFooter className="border-t bg-background px-6 py-4 sticky bottom-0">
              <div className="flex w-full items-center justify-between gap-3">
                <Button variant="ghost" onClick={resetAll} className="text-muted-foreground">
                  Reset All
                </Button>
                <SheetClose asChild>
                  <Button onClick={() => setFiltersOpen(false)}>Apply</Button>
                </SheetClose>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop/tablet toolbar — unchanged */}
      <div className="hidden md:block rounded-xl border bg-card/40 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_160px_160px_220px_220px_220px] gap-3 md:gap-4">
          <div className="w-full">
            <Input placeholder="Search collections…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="w-full">
            <Input type="number" placeholder="Min Floor" inputMode="decimal" value={minFloor} onChange={(e) => setMinFloor(e.target.value)} />
          </div>

          <div className="w-full">
            <Input type="number" placeholder="Min Volume" inputMode="decimal" value={minVolume} onChange={(e) => setMinVolume(e.target.value)} />
          </div>

          <div className="w-full">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">{sortLabel(sortBy)}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {SORT_OPTIONS.map((s) => (
                  <DropdownMenuItem key={s.key} onClick={() => setSortBy(s.key)}>{s.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="w-full">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">Metric Window: {windowLabel(windowKey)}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {WINDOW_OPTIONS.map((w) => (
                  <DropdownMenuItem key={w.key} onClick={() => setWindowKey(w.key)}>{w.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="w-full">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  Currency: {currencyLabel(currencyOptions, currencyId)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {currencyOptions.map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => setCurrencyId(String(c.id))}>
                    {c.symbol} {c.id === "native" ? "(native)" : ""}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isLoading && Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} className="h-56 w-full rounded-xl" />))}

        {!isLoading && featuredDetails && (
          <div className="relative">
            <span className="absolute left-3 top-3 z-10 inline-flex items-center rounded-full bg-amber-400 text-black text-[11px] font-semibold px-2 py-0.5 shadow">
              Featured
            </span>
            <CollectionCard key={`featured-${featuredDetails.id}`} collection={featuredDetails} />
          </div>
        )}

        {!isLoading && gridCollections.map((c) => (<CollectionCard key={c.id} collection={c} />))}

        {!isLoading && gridCollections.length === 0 && !featuredDetails && (
          <div className="col-span-full text-center py-20 text-muted-foreground">😔 No collections found.</div>
        )}

        {!isLoading && isFetchingNextPage && (
          <div className="col-span-full text-center py-6 flex items-center gap-2">
            <Loader2 className="animate-spin" /> Loading more…
          </div>
        )}
      </div>

      <div ref={loaderRef} className="h-10" />
    </div>
  );
}

/* ───────────────────────────── helpers ───────────────────────────── */

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "volumeDesc", label: "Top Volume (All-time)" },
  { key: "volumeAsc", label: "Bottom Volume (All-time)" },
  { key: "floorDesc", label: "Highest Floor" },
  { key: "floorAsc", label: "Lowest Floor" },
  { key: "itemsDesc", label: "Most Items" },
  { key: "itemsAsc", label: "Fewest Items" },
];

function sortLabel(k: SortKey) {
  return SORT_OPTIONS.find((s) => s.key === k)?.label ?? "Top Volume (All-time)";
}

const WINDOW_OPTIONS: { key: WindowKey; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d",  label: "7d"  },
  { key: "30d", label: "30d" },
];

function windowLabel(k: WindowKey) {
  return WINDOW_OPTIONS.find((w) => w.key === k)?.label ?? "24h";
}

/* currency utilities */

function useCurrencies() {
  const [state, setState] = useState<{ items: Array<{ id: string; symbol: string; decimals: number; kind: string }> }>({ items: [] });
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch("/api/currencies/active", { cache: "no-store" });
        const j = await res.json();
        const active = (j?.items ?? []) as Array<{ id: string; symbol: string; decimals: number; kind: string }>;
        const filtered = active.filter(
          (c) => String(c.kind).toUpperCase() !== "NATIVE" && String(c.symbol).toUpperCase() !== "ETN"
        );
        const items = [{ id: "native", symbol: "ETN", decimals: 18, kind: "NATIVE" as const }, ...filtered];
        if (!cancel) setState({ items });
      } catch {
        if (!cancel) setState({ items: [{ id: "native", symbol: "ETN", decimals: 18, kind: "NATIVE" as const }] as any });
      }
    })();
    return () => { cancel = true; };
  }, []);
  return state;
}

function currencyLabel(opts: Array<{ id: string; symbol: string }>, id: string) {
  return opts.find((c) => String(c.id) === id)?.symbol ?? "ETN";
}
