// components/profile/profile-collections-tab.tsx
"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Info } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* ----------------------------- Types ----------------------------- */

type CurrencyOpt = {
  id?: string;
  symbol: string;
  decimals: number;
  kind: "NATIVE" | "ERC20";
};

type CollectionRowBase = {
  id: string;
  name: string | null;
  symbol: string | null;
  contract: string;      // ORIGINAL CASING PRESERVED
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  standard: string;
  itemsCount: number;
  ownersCount: number;
  floorPrice: number;    // DB aggregate (ETN) – kept for legacy sorts
  volume: number;        // DB aggregate (ETN)
  change24h: number;
  ownerAddress: string;  // ORIGINAL CASING PRESERVED
  creatorId: string;
  createdAt: string;
  updatedAt: string;
};

type CollectionRow = CollectionRowBase & {
  // New per-currency fields from API
  floor: number | null;
  floorBase: string | null;
  volumeTotal: number;
  volume24h: number;
  currency: CurrencyOpt;
};

type ApiPage = {
  items: CollectionRow[];
  nextCursor: string | null;
  currency: CurrencyOpt;
};

/* ----------------------------- utils ----------------------------- */

function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = React.useState<T>(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

function trimNum(n: number | null | undefined, max = 3): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}

/* ----------------------------- main ----------------------------- */

export default function ProfileCollectionsTab({
  address,
  username,
}: {
  address: string;  // do not touch casing
  username: string;
}) {
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState<"both" | "owner" | "creator">("both");
  const [sort, setSort] = React.useState<"recent" | "floor" | "volume" | "items" | "owners" | "name">("recent");

  // Currency filter state: 'native' or <currencyId>
  const [currency, setCurrency] = React.useState<string>("native");

  const dq = useDebounced(q, 350);

  /* ---- load active currencies for the select ---- */
  const { data: curData } = useQuery({
    queryKey: ["active-currencies"],
    queryFn: async () => {
      const r = await fetch("/api/currencies/active", { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to load currencies");
      return (await r.json()) as {
        items: { id: string; symbol: string; decimals: number; kind: "NATIVE" | "ERC20" }[];
      };
    },
    staleTime: 60_000,
  });

  const currencyOptions: { value: string; label: string }[] = React.useMemo(() => {
    const base = [{ value: "native", label: "ETN (native)" }];
    const extras =
      curData?.items
        ?.filter((c) => c.kind === "ERC20")
        .map((c) => ({ value: c.id, label: c.symbol })) ?? [];
    return [...base, ...extras];
  }, [curData]);

  /* ---- page fetcher ---- */
  const fetchPage = async ({ pageParam }: { pageParam?: string | null }): Promise<ApiPage> => {
    const cursor = (pageParam ?? undefined) as string | undefined;
    const params = new URLSearchParams();
    params.set("limit", "20");
    if (cursor) params.set("cursor", cursor);
    if (dq) params.set("q", dq);
    params.set("role", role);
    params.set("sort", sort);
    params.set("currency", currency); // 👈 per-currency

    const res = await fetch(`/api/profile/${address}/collections?` + params.toString(), {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error((await res.text().catch(() => "")) || "Failed to load collections");
    }
    return (await res.json()) as ApiPage;
  };

  /* ---- infinite query ---- */
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    error,
  } = useInfiniteQuery<ApiPage, Error>({
    queryKey: ["profile-collections", address, dq, role, sort, currency] as const,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => fetchPage({ pageParam: pageParam as string | null }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  React.useEffect(() => {
    if (error) toast.error(error.message || "Failed to load collections");
  }, [error]);

  const items: CollectionRow[] = React.useMemo(() => {
    const pages = (data?.pages ?? []) as ApiPage[];
    return pages.flatMap((p) => p.items);
  }, [data]);

  // current symbol (from first page; all pages use same currency)
  const currentSymbol = data?.pages?.[0]?.currency?.symbol ?? (currency === "native" ? "ETN" : "");

  /* ---- infinite scroll sentinel ---- */
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (!hasNextPage || isFetchingNextPage) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNextPage();
      },
      { rootMargin: "1200px 0px 1200px 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, items.length]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full sm:max-w-md items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${username}'s collections`}
            className="w-full"
            aria-label="Search collections"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Role */}
          <Select value={role} onValueChange={(v) => setRole(v as any)}>
            <SelectTrigger className="w-40" aria-label="Filter by role">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="both">Owned + Created</SelectItem>
              <SelectItem value="owner">Owned</SelectItem>
              <SelectItem value="creator">Created</SelectItem>
            </SelectContent>
          </Select>

          {/* Currency */}
          <Select value={currency} onValueChange={(v) => setCurrency(v)}>
            <SelectTrigger className="w-40" aria-label="Currency">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent align="end">
              {currencyOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sort} onValueChange={(v) => setSort(v as any)}>
            <SelectTrigger className="w-40" aria-label="Sort">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="floor">Lowest floor</SelectItem>
              <SelectItem value="volume">Highest volume</SelectItem>
              <SelectItem value="items">Most items</SelectItem>
              <SelectItem value="owners">Most owners</SelectItem>
              <SelectItem value="name">A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div
            className={cn(
              "grid gap-4 sm:gap-5",
              "grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
            )}
          >
            {items.map((c) => (
              <CollectionCard key={c.id} c={c} currSymbol={currentSymbol} />
            ))}
          </div>

          <div ref={sentinelRef} className="h-10" />
          {isFetchingNextPage && <GridLoaderHint />}
        </>
      )}

      {error ? (
        <div className="pt-3">
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------- cards ----------------------------- */

function CollectionCard({ c, currSymbol }: { c: CollectionRow; currSymbol: string }) {
  const name = c.name || c.symbol || "Untitled Collection";
  const floorDisplay =
    c.floor == null ? "—" : `${trimNum(c.floor)} ${currSymbol}`;
  const volDisplay = `${trimNum(c.volume24h)} ${currSymbol}`;

  return (
    <Link
      href={`/collections/${c.contract}`} // ORIGINAL CASING
      className="group rounded-2xl border border-border/40 bg-background/60 hover:bg-background/70 transition-colors overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring/60"
      prefetch={false}
      title={name}
    >
      {/* Cover */}
      <div className="relative w-full aspect-[16/9] overflow-hidden bg-gradient-to-b from-black/40 to-black/10">
        {c.coverUrl ? (
          <Image
            src={c.coverUrl}
            alt={name}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full" />
        )}
      </div>

      {/* Body */}
      <div className="p-3 sm:p-4">
        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden border border-border/50 shadow-sm bg-background">
            {c.logoUrl ? (
              <Image src={c.logoUrl} alt={`${name} logo`} fill unoptimized sizes="40px" className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate tracking-tight">{name}</div>
            <div className="text-xs text-muted-foreground truncate">{c.contract}</div>
          </div>
        </div>

        {/* Stats row 1 */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Stat
            label="Floor"
            value={floorDisplay}
            tooltip={
              c.floorBase
                ? `${c.floorBase} base units`
                : undefined
            }
          />
          <Stat
            label="Volume (24h)"
            value={volDisplay}
            tooltip="Total sales in the last 24h"
          />
          <Stat label="Items" value={c.itemsCount.toLocaleString()} />
        </div>

        {/* Stats row 2 */}
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <Stat label="Owners" value={c.ownersCount.toLocaleString()} />
          <Stat
            label="24h Δ"
            value={`${c.change24h > 0 ? "+" : ""}${(c.change24h || 0).toFixed(2)}%`}
          />
          <div className="flex items-center justify-end">
            <span className="inline-flex items-center gap-1 text-xs text-brand font-medium opacity-80 group-hover:opacity-100">
              View <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  const inner = (
    <div className="rounded-md bg-background/50 border border-border/30 px-2 py-1 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-center gap-1">
        {label}
        {tooltip ? <Info className="w-3 h-3 opacity-60" /> : null}
      </div>
      <div className="text-xs font-medium">{value}</div>
    </div>
  );
  if (!tooltip) return inner;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ----------------------------- states ----------------------------- */

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:gap-5 grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/40 overflow-hidden">
          <div className="w-full aspect-[16/9] bg-muted animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
            <div className="h-4 w-1/3 bg-muted animate-pulse rounded" />
            <div className="h-8 w-full bg-muted animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-border/40 bg-muted/20 p-8 text-center">
      <h3 className="text-lg font-semibold">No collections yet</h3>
      <p className="text-sm text-muted-foreground mt-1">
        When you create or own a collection, it’ll show up here.
      </p>
      <div className="mt-4">
        <Link href="/create">
          <Button>Create a collection</Button>
        </Link>
      </div>
    </div>
  );
}

function GridLoaderHint() {
  return (
    <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
      Loading more…
    </div>
  );
}
