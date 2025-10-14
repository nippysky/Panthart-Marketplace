"use client";

/**
 * NFTItemsTab (revamped • spacing tuned)
 * - Adds subtle mobile horizontal padding so cards don’t touch the screen edges.
 * - Keeps your original spacing from `sm:` upward.
 */

import * as React from "react";
import Link from "next/link";
import {
  useInfiniteQuery,
  keepPreviousData,
  type QueryFunctionContext,
  type InfiniteData,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import {
  Loader,
  RotateCcw,
  Sparkles,
  Sigma,
  SlidersHorizontal,
  X,
  Search,
  ArrowDown01,
  ArrowUp01,
  Crown,
  Funnel,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Slider } from "@/components/ui/slider";

import ArtDisplay from "@/components/shared/art-display";
import ArtDisplaySkeleton from "../skeleton/ArtDisplaySkeleton";
import type { NFTItem } from "@/lib/types/types";

/* ---------------- hydration guard (prevents Radix id mismatches) ---------------- */
function useHydrated() {
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);
  return hydrated;
}

type PriceSort = "lowToHigh" | "highToLow" | "";
type RaritySort = "asc" | "desc" | "";

type RawNFT = {
  id: string | number;
  tokenId: string;
  name?: string | null;
  imageUrl?: string | null;
  contract: string;
  description?: string | null;
  traits?: any;
  attributes?: any;
  tokenUri?: string | null;
  metadataHash?: string | null;
  standard?: string | null;
  royaltyBps?: number | null;
  royaltyRecipient?: string | null;
  collectionId?: string | null;

  isListed: boolean;
  listingPrice?: number;
  listingPriceWei?: string;
  listingCurrencySymbol?: string | null;
  isAuctioned: boolean;

  viewCount?: number;
  favoriteCount?: number;
  createdAt: string;
  updatedAt: string;

  rarityScore?: number | null;
  rarityRank?: number | null;
  population?: number | null;
};

type PageResponse = {
  nfts: RawNFT[];
  nextCursor: string | null;
};

type FacetsResponse = {
  population: number;
  traits: Array<{ type: string; values: Array<{ value: string; count: number }> }>;
};

type Key = Readonly<
  [
    "nfts",
    string,
    { readonly search?: string },
    { readonly listed?: boolean },
    { readonly auctioned?: boolean },
    { readonly priceSort?: PriceSort },
    { readonly raritySort?: RaritySort },
    { readonly rankMin?: number },
    { readonly rankMax?: number },
    { readonly includeUnranked?: boolean },
    { readonly traitPick?: string }
  ]
>;

type TraitSelections = Record<string, string[]>;

function stringifyTraitPick(pick: TraitSelections): string {
  const entries = Object.entries(pick)
    .map(([k, arr]) => [k, Array.from(new Set(arr)).sort()])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

function clampPositiveInt(n: number, fallback = 1) {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export default function NFTItemsTab({
  contract,
  collectionName,
  activeSale = true,
  rarityEnabled: rarityEnabledProp,
  rarityPopulation: rarityPopulationProp,
}: {
  contract: string;
  collectionName: string;
  activeSale?: boolean;
  rarityEnabled?: boolean;
  rarityPopulation?: number;
}) {
  const hydrated = useHydrated();

  // -------------------- Local state --------------------
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filterListed, setFilterListed] = React.useState(false);
  const [filterAuctioned, setFilterAuctioned] = React.useState(false);

  const [priceSort, setPriceSort] = React.useState<PriceSort>("");
  const [raritySort, setRaritySort] = React.useState<RaritySort>("");

  const [rankMin, setRankMin] = React.useState<string>("");
  const [rankMax, setRankMax] = React.useState<string>("");
  const [includeUnranked, setIncludeUnranked] = React.useState(true);

  const [traitPick, setTraitPick] = React.useState<TraitSelections>({});

  const [filtersOpen, setFiltersOpen] = React.useState(false);

  React.useEffect(() => {
    setSearchTerm("");
    setFilterListed(false);
    setFilterAuctioned(false);
    setPriceSort("");
    setRaritySort("");
    setRankMin("");
    setRankMax("");
    setIncludeUnranked(true);
    setTraitPick({});
  }, [contract]);

  const queryClient = useQueryClient();

  // -------------------- Facets --------------------
  const { data: facets } = useQuery<FacetsResponse>({
    queryKey: ["facets", contract],
    queryFn: async () => {
      const res = await fetch(`/api/collections/${contract}/facets`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch facets");
      return (await res.json()) as FacetsResponse;
    },
    staleTime: 5 * 60 * 1000,
  });

  const populationFromFacets = facets?.population ?? 0;
  const traitBuckets = facets?.traits ?? [];

  const rarityPopulation = rarityPopulationProp ?? populationFromFacets;
  const rarityEnabled = rarityEnabledProp ?? rarityPopulation > 0;

  // -------------------- Query key & data --------------------
  const queryKey = React.useMemo<Key>(
    () => [
      "nfts",
      contract,
      { search: searchTerm.trim() || undefined },
      { listed: filterListed || undefined },
      { auctioned: filterAuctioned || undefined },
      { priceSort: priceSort || undefined },
      { raritySort: raritySort || undefined },
      { rankMin: rankMin ? clampPositiveInt(Number(rankMin)) : undefined },
      { rankMax: rankMax ? clampPositiveInt(Number(rankMax)) : undefined },
      { includeUnranked: includeUnranked },
      { traitPick: stringifyTraitPick(traitPick) || undefined },
    ],
    [
      contract,
      searchTerm,
      filterListed,
      filterAuctioned,
      priceSort,
      raritySort,
      rankMin,
      rankMax,
      includeUnranked,
      traitPick,
    ]
  );

  React.useEffect(() => {
    function onMinted(e: any) {
      const c = e?.detail?.contract?.toLowerCase?.() || "";
      if (c && c === contract.toLowerCase()) {
        queryClient.invalidateQueries({ queryKey: ["nfts", contract], exact: false });
        queryClient.refetchQueries({ queryKey: ["nfts", contract], exact: false });
      }
    }
    window.addEventListener("nft:minted", onMinted as any);
    return () => window.removeEventListener("nft:minted", onMinted as any);
  }, [contract, queryClient]);

  React.useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") {
        queryClient.refetchQueries({ queryKey: ["nfts", contract], exact: false });
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [contract, queryClient]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<
    PageResponse,
    Error,
    InfiniteData<PageResponse>,
    Key,
    string | undefined
  >({
    queryKey,
    queryFn: async ({
      queryKey,
      pageParam,
    }: QueryFunctionContext<Key, string | undefined>) => {
      const [
        ,
        keyContract,
        searchObj,
        listedObj,
        auctionedObj,
        priceSortObj,
        raritySortObj,
        rankMinObj,
        rankMaxObj,
        includeUnrankedObj,
        traitPickObj,
      ] = queryKey;

      const params = new URLSearchParams();
      params.set("limit", "20");
      if (pageParam) params.set("cursor", pageParam);

      if (searchObj.search) params.set("search", searchObj.search);
      if (listedObj.listed) params.set("listed", "true");
      if (auctionedObj.auctioned) params.set("auctioned", "true");

      if (raritySortObj.raritySort) {
        params.set("raritySort", raritySortObj.raritySort);
      } else if (priceSortObj.priceSort) {
        params.set("sort", priceSortObj.priceSort);
      }

      if (rankMinObj.rankMin != null) params.set("rankMin", String(rankMinObj.rankMin));
      if (rankMaxObj.rankMax != null) params.set("rankMax", String(rankMaxObj.rankMax));
      params.set("includeUnranked", includeUnrankedObj.includeUnranked ? "true" : "false");

      if (traitPickObj.traitPick) {
        const pairs: [string, string[]][] = JSON.parse(traitPickObj.traitPick);
        for (const [type, values] of pairs) {
          for (const v of values) params.append(`trait[${type}]`, v);
        }
      }

      const res = await fetch(`/api/collections/${keyContract}?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch NFTs");
      return (await res.json()) as PageResponse;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
    refetchInterval: activeSale ? 7000 : 15000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: activeSale ? 3000 : 5000,
    placeholderData: keepPreviousData,
  });

  const allNFTs = React.useMemo<NFTItem[]>(
    () =>
      data?.pages.flatMap((page) =>
        page.nfts.map((n) => {
          const std =
            n.standard === "ERC721" || n.standard === "ERC1155"
              ? (n.standard as "ERC721" | "ERC1155")
              : undefined;

          const shaped: any = {
            id: String(n.id),
            nftAddress: n.contract,
            tokenId: n.tokenId,
            name: n.name ?? `#${n.tokenId}`,
            image: n.imageUrl ?? "/placeholder.svg",
            description: n.description ?? undefined,
            traits: n.traits ?? undefined,
            attributes: n.attributes ?? undefined,
            tokenUri: n.tokenUri ?? undefined,
            metadataHash: undefined,
            contract: n.contract,
            standard: std,
            royaltyBps: n.royaltyBps ?? undefined,
            royaltyRecipient: n.royaltyRecipient ?? undefined,
            ownerId: undefined,
            collectionId: n.collectionId ?? undefined,
            isListed: n.isListed,
            listingPrice: n.listingPrice ?? undefined,
            isAuctioned: n.isAuctioned,
            viewCount: (n as any).viewCount ?? 0,
            favoriteCount: (n as any).favoriteCount ?? 0,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
          };

          if (n.listingPriceWei) shaped.listingPriceWei = n.listingPriceWei;
          if (n.listingCurrencySymbol) shaped.currencySymbol = n.listingCurrencySymbol;

          return shaped as NFTItem;
        })
      ) ?? [],
    [data]
  );

  // -------------------- Infinite scroll --------------------
  const loaderRef = React.useRef<HTMLDivElement>(null);
  const onIntersect = React.useCallback<IntersectionObserverCallback>(
    ([entry]) => {
      if (entry.isIntersecting && hasNextPage) fetchNextPage();
    },
    [fetchNextPage, hasNextPage]
  );
  React.useEffect(() => {
    const obs = new IntersectionObserver(onIntersect, { rootMargin: "200px" });
    const node = loaderRef.current;
    if (node) obs.observe(node);
    return () => obs.disconnect();
  }, [onIntersect]);

  // -------------------- Trait helpers --------------------
  const toggleTrait = (type: string, value: string) => {
    setTraitPick((prev) => {
      const next: TraitSelections = { ...prev };
      const values = new Set(next[type] ?? []);
      if (values.has(value)) values.delete(value);
      else values.add(value);
      next[type] = Array.from(values);
      if (next[type].length === 0) delete next[type];
      return next;
    });
  };
  const isTraitChecked = (type: string, value: string) => {
    const arr = traitPick[type];
    return !!arr && arr.includes(value);
  };

  // -------------------- Actions --------------------
  const clearAll = () => {
    setSearchTerm("");
    setFilterListed(false);
    setFilterAuctioned(false);
    setPriceSort("");
    setRaritySort("");
    setRankMin("");
    setRankMax("");
    setIncludeUnranked(true);
    setTraitPick({});
  };

  const setTopN = (n: number) => {
    if (!rarityEnabled || rarityPopulation <= 0) return;
    setRankMin("1");
    setRankMax(String(Math.min(n, rarityPopulation)));
    setIncludeUnranked(false);
    setRaritySort("asc");
    setPriceSort("");
    setFiltersOpen(false);
  };

  const choosePriceSort = (v: PriceSort) => {
    setPriceSort(v);
    if (v) setRaritySort("");
  };
  const chooseRaritySort = (v: RaritySort) => {
    setRaritySort(v);
    if (v) setPriceSort("");
  };

  const activeTraitsCount = Object.values(traitPick).reduce((acc, arr) => acc + arr.length, 0);
  const activeFilters =
    (filterListed ? 1 : 0) +
    (filterAuctioned ? 1 : 0) +
    (searchTerm.trim() ? 1 : 0) +
    (priceSort ? 1 : 0) +
    (raritySort ? 1 : 0) +
    (rankMin ? 1 : 0) +
    (rankMax ? 1 : 0) +
    (!includeUnranked ? 1 : 0) +
    activeTraitsCount;

  /* -------------------- SSR-safe placeholder before hydration -------------------- */
  if (!hydrated) {
    return (
      <section className="flex-1">
        <div className="sticky top-0 z-20 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          {/* mobile padding added */}
          <div className="mx-auto w-full px-3 sm:px-0 py-3 flex flex-wrap items-center gap-2">
            <div className="h-9 w-full sm:w-[360px] bg-muted/60 rounded-md" />
            <div className="h-9 w-[220px] bg-muted/50 rounded-md" />
            <div className="h-9 w-9 bg-muted/50 rounded-md" />
            <div className="h-9 w-[110px] bg-muted/50 rounded-md" />
          </div>
        </div>

        {/* mobile padding + slightly tighter gap on xs */}
        <div className="mx-auto w-full px-3 sm:px-0 mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <ArtDisplaySkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  // -------------------- UI --------------------
  return (
    <section className="flex-1">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        {/* mobile padding added */}
        <div className="mx-auto w-full px-3 sm:px-0 py-3 flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={`Search ${collectionName}…`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Segmented sort */}
          <Tabs
            value={raritySort ? `rarity:${raritySort}` : priceSort ? `price:${priceSort}` : ""}
            onValueChange={(val) => {
              if (val.startsWith("price:")) {
                choosePriceSort(val.split(":")[1] as PriceSort);
              } else if (val.startsWith("rarity:")) {
                chooseRaritySort(val.split(":")[1] as RaritySort);
              } else {
                setPriceSort("");
                setRaritySort("");
              }
            }}
            className="shrink-0"
          >
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="">Default</TabsTrigger>
              <TabsTrigger value="price:lowToHigh" className="gap-2">
                <ArrowDown01 className="h-4 w-4" />
                Price
              </TabsTrigger>
              {rarityEnabled ? (
                <TabsTrigger value={`rarity:${raritySort || "asc"}`} className="gap-2">
                  <Crown className="h-4 w-4" />
                  Rarity
                </TabsTrigger>
              ) : (
                <TabsTrigger value="price:highToLow" className="gap-2">
                  <ArrowUp01 className="h-4 w-4" />
                  Price
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          {/* Refresh */}
          <Button
            variant="outline"
            size="icon"
            title="Refresh"
            onClick={() =>
              queryClient.refetchQueries({ queryKey: ["nfts", contract], exact: false })
            }
          >
            <RotateCcw className="h-4 w-4" />
          </Button>

          {/* Filters panel trigger */}
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="default" className="gap-2">
                <Funnel className="h-4 w-4" />
                Filters
                {activeFilters > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {activeFilters}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl p-0">
              <SheetHeader className="px-6 sm:px-8 pt-6">
                <div className="flex items-center justify-between">
                  <SheetTitle className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters & Sort
                  </SheetTitle>
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    Reset All
                  </Button>
                </div>
              </SheetHeader>

              <div className="px-6 sm:px-8 pb-24 pt-4 overflow-y-auto h-full">
                <div className="grid gap-8">
                  {/* Search (dup for mobile) */}
                  <div className="rounded-2xl border p-4 sm:p-5">
                    <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Search className="h-4 w-4" /> Search
                    </div>
                    <Input
                      placeholder="Search by name or ID…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  {/* Price sort */}
                  <div className="rounded-2xl border p-4 sm:p-5">
                    <div className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <Sigma className="h-4 w-4" />
                      Sort by Price
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        variant={priceSort === "lowToHigh" ? "default" : "outline"}
                        className="w-full justify-center"
                        onClick={() => choosePriceSort("lowToHigh")}
                      >
                        <ArrowDown01 className="mr-2 h-4 w-4" />
                        Low → High
                      </Button>
                      <Button
                        variant={priceSort === "highToLow" ? "default" : "outline"}
                        className="w-full justify-center"
                        onClick={() => choosePriceSort("highToLow")}
                      >
                        <ArrowUp01 className="mr-2 h-4 w-4" />
                        High → Low
                      </Button>
                    </div>
                  </div>

                  {/* Rarity */}
                  {rarityEnabled && (
                    <div className="rounded-2xl border p-4 sm:p-5">
                      <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Rarity
                        <span className="ml-auto text-xs text-muted-foreground">
                          Ranked: {rarityPopulation.toLocaleString()}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <Button
                          variant={raritySort === "asc" ? "default" : "outline"}
                          className="w-full justify-center"
                          onClick={() => chooseRaritySort("asc")}
                        >
                          Rarest → Common
                        </Button>
                        <Button
                          variant={raritySort === "desc" ? "default" : "outline"}
                          className="w-full justify-center"
                          onClick={() => chooseRaritySort("desc")}
                        >
                          Common → Rarest
                        </Button>
                      </div>

                      <div className="space-y-3 mb-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Rank Range</span>
                          <div className="flex items-center gap-2">
                            <Input
                              inputMode="numeric"
                              placeholder="Min"
                              value={rankMin}
                              onChange={(e) => setRankMin(e.target.value)}
                              className="h-8 w-24"
                            />
                            <Input
                              inputMode="numeric"
                              placeholder="Max"
                              value={rankMax}
                              onChange={(e) => setRankMax(e.target.value)}
                              className="h-8 w-24"
                            />
                          </div>
                        </div>
                        <Slider
                          disabled={rarityPopulation <= 0}
                          min={1}
                          max={Math.max(1, rarityPopulation)}
                          value={[
                            Math.min(
                              clampPositiveInt(Number(rankMin || "1"), 1),
                              Math.max(1, rarityPopulation)
                            ),
                            Math.min(
                              clampPositiveInt(Number(rankMax || String(rarityPopulation)), 1),
                              Math.max(1, rarityPopulation)
                            ),
                          ]}
                          onValueChange={([min, max]) => {
                            setRankMin(String(min));
                            setRankMax(String(max));
                          }}
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setTopN(100)}>
                          Top 100
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setTopN(1000)}>
                          Top 1000
                        </Button>
                        <div className="ml-auto flex items-center gap-2 text-sm">
                          <Switch
                            id="inc-unranked"
                            checked={includeUnranked}
                            onCheckedChange={(v) => setIncludeUnranked(!!v)}
                          />
                          <label htmlFor="inc-unranked">Include unranked</label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Status */}
                  <div className="rounded-2xl border p-4 sm:p-5">
                    <div className="text-sm font-semibold mb-3">Status</div>
                    <div className="flex flex-col gap-3 text-sm">
                      <label className="flex items-center gap-3">
                        <Checkbox
                          checked={filterListed}
                          onCheckedChange={() => setFilterListed((v) => !v)}
                          id="listed-only"
                        />
                        <span>Listed Only</span>
                      </label>
                      <label className="flex items-center gap-3">
                        <Checkbox
                          checked={filterAuctioned}
                          onCheckedChange={() => setFilterAuctioned((v) => !v)}
                          id="auction-only"
                        />
                        <span>Auctioned Only</span>
                      </label>
                    </div>
                  </div>

                  {/* Traits */}
                  {traitBuckets.length > 0 && (
                    <div className="rounded-2xl border p-4 sm:p-5">
                      <div className="text-sm font-semibold mb-4">Traits</div>
                      <ScrollArea className="h-96 rounded-xl border">
                        <div className="p-3 sm:p-4">
                          <Accordion type="multiple" className="w-full">
                            {traitBuckets.map((bucket) => (
                              <AccordionItem key={bucket.type} value={bucket.type}>
                                <AccordionTrigger className="text-sm font-medium">
                                  {bucket.type}
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                    {bucket.values.map((v) => (
                                      <label
                                        key={`${bucket.type}:${v.value}`}
                                        className="flex items-center gap-3 text-sm rounded-lg px-2 py-2 hover:bg-muted/40"
                                      >
                                        <Checkbox
                                          checked={isTraitChecked(bucket.type, v.value)}
                                          onCheckedChange={() => toggleTrait(bucket.type, v.value)}
                                        />
                                        <span className="truncate">
                                          {v.value}{" "}
                                          <span className="text-xs text-muted-foreground">({v.count})</span>
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </div>

              <SheetFooter className="border-t bg-background px-6 sm:px-8 py-4 sticky bottom-0">
                <div className="flex w-full items-center justify-between gap-3">
                  <Button variant="ghost" onClick={clearAll} className="text-muted-foreground">
                    Reset All
                  </Button>
                  <Button onClick={() => setFiltersOpen(false)}>Apply</Button>
                </div>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        {/* Active chips row */}
        {activeFilters > 0 && (
          <div className="mx-auto max-w-[1400px] px-3 sm:px-0 pb-3 flex flex-wrap items-center gap-2">
            {filterListed && (
              <Badge variant="secondary" className="gap-1">
                Listed
                <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setFilterListed(false)} />
              </Badge>
            )}
            {filterAuctioned && (
              <Badge variant="secondary" className="gap-1">
                Auctioned
                <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setFilterAuctioned(false)} />
              </Badge>
            )}
            {priceSort && (
              <Badge variant="secondary" className="gap-1">
                Price: {priceSort === "lowToHigh" ? "Low → High" : "High → Low"}
                <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setPriceSort("")} />
              </Badge>
            )}
            {raritySort && (
              <Badge variant="secondary" className="gap-1">
                Rarity: {raritySort === "asc" ? "Rarest → Common" : "Common → Rarest"}
                <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setRaritySort("")} />
              </Badge>
            )}
            {(rankMin || rankMax) && (
              <Badge variant="secondary" className="gap-1">
                Rank {rankMin || "1"}–{rankMax || rarityPopulation || "?"}
                <X
                  className="ml-1 h-3 w-3 cursor-pointer"
                  onClick={() => {
                    setRankMin("");
                    setRankMax("");
                  }}
                />
              </Badge>
            )}
            {!includeUnranked && (
              <Badge variant="secondary" className="gap-1">
                Ranked only
                <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setIncludeUnranked(true)} />
              </Badge>
            )}
            {Object.entries(traitPick).flatMap(([type, values]) =>
              values.map((v) => (
                <Badge key={`${type}:${v}`} variant="secondary" className="gap-1">
                  {type}: {v}
                  <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => toggleTrait(type, v)} />
                </Badge>
              ))
            )}

            <Button variant="link" className="ml-auto px-0" onClick={clearAll}>
              Clear all
            </Button>
          </div>
        )}
      </div>

      {/* Grid — mobile padding + balanced gaps */}
      <div className="mx-auto w-full px-3 sm:px-0 mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
        {(!data || data.pages.length === 0) &&
          Array.from({ length: 10 }).map((_, i) => <ArtDisplaySkeleton key={i} />)}

        {allNFTs.map((nft) => (
          <Link
            key={`${nft.nftAddress}-${nft.tokenId}`}
            href={`/collections/${nft.nftAddress}/${nft.tokenId}`}
            className="block"
          >
            <ArtDisplay nft={nft} />
          </Link>
        ))}

        {allNFTs.length === 0 && data && (
          <div className="col-span-full text-center py-10 text-sm text-muted-foreground">
            😔 No NFTs match your criteria.
          </div>
        )}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={loaderRef} className="h-10" />

      {/* Loading more — add mobile padding */}
      {isFetchingNextPage && (
        <div className="mx-auto max-w-[1400px] px-3 sm:px-0 text-center py-6">
          <Loader className="inline-block h-6 w-6 animate-spin mr-2" />
          Loading more…
        </div>
      )}
    </section>
  );
}
