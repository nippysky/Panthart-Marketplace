// components/profile/profile-items-tab.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import {
  useInfiniteQuery,
  keepPreviousData,
  type QueryFunctionContext,
  type InfiniteData,
  useQueryClient,
} from "@tanstack/react-query";
import {
  SlidersHorizontal,
  ArrowDown01,
  ArrowUp01,
  Loader,
  RotateCcw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import ArtDisplay from "@/components/shared/art-display";
import ArtDisplaySkeleton from "@/components/skeleton/ArtDisplaySkeleton";
import type { NFTItem } from "@/lib/types/types";
import { toast } from "sonner";

type SortOption = "lowToHigh" | "highToLow" | "";

/** Extended to carry price base-units + currency symbol (for ArtDisplay) */
type RawNFT = {
  id: string;
  tokenId: string;
  name: string;
  imageUrl: string;
  description?: string | null;
  traits?: any;
  attributes?: any;
  tokenUri?: string | null;
  metadataHash?: string | null;
  standard?: string | null;
  contract: string;
  royaltyBps?: number | null;
  royaltyRecipient?: string | null;
  collectionId?: string | null;

  isListed: boolean;
  listingPrice?: number;
  listingPriceWei?: string;              // NEW
  listingCurrencySymbol?: string | null; // NEW

  isAuctioned: boolean;
  viewCount: number;
  favoriteCount: number;
  createdAt: string;
  updatedAt: string;
};

type PageResponse = { items: RawNFT[]; nextCursor: string | null };

type Key = Readonly<
  [
    "profile-items",
    string,
    { readonly search?: string },
    { readonly listed?: boolean },
    { readonly auctioned?: boolean },
    { readonly sort?: SortOption }
  ]
>;

export default function ProfileItemsTab({
  address,
  ownerLabel,
}: {
  address: string;
  ownerLabel: string;
}) {
  // Sheet state (draft values)
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [draftSearch, setDraftSearch] = React.useState("");
  const [draftListed, setDraftListed] = React.useState(false);
  const [draftAuctioned, setDraftAuctioned] = React.useState(false);
  const [draftSort, setDraftSort] = React.useState<SortOption>("");

  // Committed values (drive the query)
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filterListed, setFilterListed] = React.useState(false);
  const [filterAuctioned, setFilterAuctioned] = React.useState(false);
  const [sortOption, setSortOption] = React.useState<SortOption>("");

  // Reset everything when the address changes
  React.useEffect(() => {
    setDraftSearch("");
    setDraftListed(false);
    setDraftAuctioned(false);
    setDraftSort("");
    setSearchTerm("");
    setFilterListed(false);
    setFilterAuctioned(false);
    setSortOption("");
  }, [address]);

  const onTopSearch = (v: string) => {
    setSearchTerm(v);
    setDraftSearch(v);
  };

  /* -------------- Query -------------- */
  const queryClient = useQueryClient();
  const queryKey = React.useMemo<Key>(
    () => [
      "profile-items",
      address,
      { search: searchTerm.trim() || undefined },
      { listed: filterListed || undefined },
      { auctioned: filterAuctioned || undefined },
      { sort: sortOption || undefined },
    ],
    [address, searchTerm, filterListed, filterAuctioned, sortOption]
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    isLoading,
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
      const [, keyAddress, searchObj, listedObj, auctionedObj, sortObj] = queryKey;
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (pageParam) params.set("cursor", pageParam);
      if (searchObj.search) params.set("search", searchObj.search);
      if (listedObj.listed) params.set("listed", "true");
      if (auctionedObj.auctioned) params.set("auctioned", "true");
      if (sortObj.sort) params.set("sort", sortObj.sort);

      const res = await fetch(`/api/profile/${keyAddress}/items?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch items");
      return (await res.json()) as PageResponse;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });

  const allNFTs = React.useMemo<NFTItem[]>(
    () =>
      data?.pages.flatMap((p) =>
        p.items.map((n) => {
          const std =
            n.standard === "ERC721" || n.standard === "ERC1155"
              ? (n.standard as "ERC721" | "ERC1155")
              : undefined;

          const shaped: any = {
            id: n.id,
            nftAddress: n.contract,
            tokenId: n.tokenId,
            name: n.name,
            image: n.imageUrl,
            description: n.description ?? undefined,
            traits: n.traits ?? undefined,
            attributes: n.attributes ?? undefined,
            tokenUri: n.tokenUri ?? undefined,
            metadataHash: n.metadataHash ?? undefined,
            contract: n.contract,
            standard: std,
            royaltyBps: n.royaltyBps ?? undefined,
            royaltyRecipient: n.royaltyRecipient ?? undefined,
            ownerId: undefined,
            collectionId: n.collectionId ?? undefined,
            isListed: n.isListed,
            listingPrice: n.listingPrice ?? undefined,
            isAuctioned: n.isAuctioned,
            viewCount: n.viewCount,
            favoriteCount: n.favoriteCount,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
          };

          // Pass through the extras for price display (native ETN or token)
          if (n.listingPriceWei) shaped.listingPriceWei = n.listingPriceWei;
          if (n.listingCurrencySymbol) shaped.currencySymbol = n.listingCurrencySymbol;

          return shaped as NFTItem;
        })
      ) ?? [],
    [data]
  );

  /* -------------- Infinite scroll -------------- */
  const loaderRef = React.useRef<HTMLDivElement>(null);
  const onIntersect = React.useCallback<IntersectionObserverCallback>(
    ([entry]) => {
      if (entry.isIntersecting && hasNextPage) fetchNextPage();
    },
    [fetchNextPage, hasNextPage]
  );
  React.useEffect(() => {
    const obs = new IntersectionObserver(onIntersect, { rootMargin: "400px" });
    const node = loaderRef.current;
    if (node) obs.observe(node);
    return () => obs.disconnect();
  }, [onIntersect]);

  /* -------------- Sheet actions -------------- */
  const applySheet = () => {
    setSearchTerm(draftSearch.trim());
    setFilterListed(draftListed);
    setFilterAuctioned(draftAuctioned);
    setSortOption(draftSort);
    setSheetOpen(false);
  };
  const resetSheet = () => {
    setDraftSearch("");
    setDraftListed(false);
    setDraftAuctioned(false);
    setDraftSort("");
  };

  return (
    <section className="flex-1">
      {/* Controls row */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
        <div className="flex items-center gap-2">
          {/* FILTERS SHEET */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filters &amp; Sort
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader className="px-4 sm:px-6 lg:px-7 pt-6">
                <SheetTitle>Filter items</SheetTitle>
              </SheetHeader>

              {/* Inner padded container */}
              <div className="p-4 sm:p-6 lg:p-7 space-y-6">
                {/* Search card */}
                <div className="rounded-xl border border-white/10 bg-background/60 backdrop-blur-sm p-4 sm:p-5">
                  <Label htmlFor="sheet-search" className="mb-2 block">
                    Search
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
                    <Input
                      id="sheet-search"
                      value={draftSearch}
                      onChange={(e) => setDraftSearch(e.target.value)}
                      className="pl-9"
                      placeholder="Name, token ID, contract…"
                    />
                  </div>
                </div>

                {/* Toggles card */}
                <div className="rounded-xl border border-white/10 bg-background/60 backdrop-blur-sm p-4 sm:p-5 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">Listed only</Label>
                      <div className="text-xs text-muted-foreground">
                        Show items currently listed for sale.
                      </div>
                    </div>
                    <Switch checked={draftListed} onCheckedChange={setDraftListed} />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">Auctioned only</Label>
                      <div className="text-xs text-muted-foreground">
                        Show items in active auctions.
                      </div>
                    </div>
                    <Switch checked={draftAuctioned} onCheckedChange={setDraftAuctioned} />
                  </div>
                </div>

                {/* Sort card */}
                <div className="rounded-xl border border-white/10 bg-background/60 backdrop-blur-sm p-4 sm:p-5">
                  <Label className="block mb-3 font-medium">Sort by price</Label>
                  <RadioGroup
                    value={draftSort}
                    onValueChange={(v) => setDraftSort(v as SortOption)}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="" id="sort-none" />
                      <Label htmlFor="sort-none">Default</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="lowToHigh" id="sort-low" />
                      <Label htmlFor="sort-low" className="inline-flex items-center gap-1">
                        <ArrowDown01 className="h-4 w-4" /> Low → High
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="highToLow" id="sort-high" />
                      <Label htmlFor="sort-high" className="inline-flex items-center gap-1">
                        <ArrowUp01 className="h-4 w-4" /> High → Low
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              <SheetFooter className="px-4 sm:px-6 lg:px-7 pb-6 gap-2">
                <Button
                  variant="ghost"
                  className="justify-self-start"
                  onClick={() => {
                    resetSheet();
                    toast.success("Filters reset");
                  }}
                >
                  Reset
                </Button>
                <Button onClick={applySheet}>Apply</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Button
            variant="outline"
            size="icon"
            title="Refresh items"
            onClick={() =>
              queryClient.refetchQueries({
                queryKey: ["profile-items", address],
                exact: false,
              })
            }
          >
            <RotateCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Top-right quick search */}
        <div className="relative w-full sm:w-auto sm:min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
          <Input
            placeholder={`Search ${ownerLabel}'s items…`}
            value={searchTerm}
            onChange={(e) => onTopSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {isLoading &&
          Array.from({ length: 8 }).map((_, i) => <ArtDisplaySkeleton key={i} />)}

        {!isLoading &&
          allNFTs.map((nft) => (
            <Link
              key={`${nft.nftAddress}-${nft.tokenId}`}
              href={`/collections/${nft.nftAddress}/${nft.tokenId}`}
              className="block"
            >
              <ArtDisplay nft={nft} />
            </Link>
          ))}

        {!isLoading && allNFTs.length === 0 && (
          <div className="col-span-full text-center py-10 text-sm text-muted-foreground">
            😔 No NFTs match your criteria.
          </div>
        )}

        {!isLoading && isFetchingNextPage && (
          <div className="col-span-full text-center py-6">
            <Loader className="inline-block h-6 w-6 animate-spin mr-2" />
            Loading more…
          </div>
        )}
      </div>

      {/* infinite scroll sentinel */}
      <div ref={loaderRef} className="h-8" />
    </section>
  );
}
