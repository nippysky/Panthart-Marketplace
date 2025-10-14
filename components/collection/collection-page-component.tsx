"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useActiveAccount } from "thirdweb/react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Slash } from "lucide-react";
import { BsTwitterX } from "react-icons/bs";
import { FiInstagram } from "react-icons/fi";
import { FaGlobeAfrica, FaDiscord, FaTelegramPlane } from "react-icons/fa";
import { toast } from "sonner";
import { formatNumber, shortenAddress } from "@/lib/utils";
import { useLoaderStore } from "@/lib/store/loader-store";
import { useIndexingStore } from "@/lib/store/useIndexingStore";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import TabView from "@/components/shared/tab-view";
import NFTItemsTab from "../shared/nft-items-tab";
import EditCollectionSheet from "../shared/edit-collection-sheet";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ShareButton from "../shared/share-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import WithdrawProceedsDialog from "./withdraw-proceeds-dialog";

/* ----------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------*/

type CollectionHeader = {
  id: string;
  name: string;
  description: string | null;
  contract: string;
  logoUrl: string | null;
  coverUrl: string | null;
  website: string | null;
  instagram: string | null;
  x: string | null;
  telegram: string | null;
  discord: string | null;
  floorPrice: number | null;
  volume: number | null;
  supply: number | null;
  ownersCount: number | null;
  itemsCount: number | null;
  ownerAddress: string;
  creator: { walletAddress: string; username: string | null; profileAvatar: string | null };
  listingActiveCount?: number;
  auctionActiveCount?: number;
};

type CurrencyOption = {
  id: string | null;
  symbol: string;
  kind: "NATIVE" | "ERC20";
  decimals: number;
  tokenAddress?: string | null;
  active?: boolean;
};

export default function CollectionPageComponent({ collection }: { collection: CollectionHeader }) {
  const router = useRouter();
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const STORAGE_KEY = `lastIndexed-${collection.contract}`;
  const showLoader = useLoaderStore((s) => s.show);
  const hideLoader = useLoaderStore((s) => s.hide);
  const { setIsIndexing } = useIndexingStore();

  const active = useActiveAccount();
  const accountAddress = active?.address?.toLowerCase() ?? null;

  const [fullDesc, setFullDesc] = useState(false);
  const hideTimer = useRef<NodeJS.Timeout | null>(null);

  /* ============================================================================
   * Currency list + selected currency
   * ========================================================================== */

  const ETN_OPTION: CurrencyOption = {
    id: null,
    symbol: "ETN",
    kind: "NATIVE",
    decimals: 18,
  };

  const { data: activeCurrencies } = useQuery({
    queryKey: ["active-currencies"],
    queryFn: async () => {
      const res = await fetch("/api/currencies/active", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load active currencies");
      const json = await res.json();
      const fromApi: CurrencyOption[] = Array.isArray(json?.items)
        ? json.items.map((it: any) => ({
            id: String(it.id),
            symbol: String(it.symbol),
            kind: (it.kind as "NATIVE" | "ERC20") ?? "ERC20",
            decimals: Number(it.decimals ?? 18),
            tokenAddress: it.tokenAddress ?? null,
            active: true,
          }))
        : [];
      return fromApi;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const currencyOptions: CurrencyOption[] = useMemo(() => {
    const list = [ETN_OPTION];
    if (activeCurrencies && activeCurrencies.length) {
      const rest = activeCurrencies.filter(
        (c) => !(c.kind === "NATIVE" && c.symbol.toUpperCase() === "ETN")
      );
      list.push(...rest);
    }
    return list;
  }, [activeCurrencies]);

  const [selectedCurrencyId, setSelectedCurrencyId] = useState<string | null>(null);

  const selectedSymbol = useMemo(() => {
    const hit = currencyOptions.find(
      (c) =>
        (selectedCurrencyId == null && c.id == null) ||
        (selectedCurrencyId != null && c.id === selectedCurrencyId)
    );
    return hit?.symbol ?? "ETN";
  }, [currencyOptions, selectedCurrencyId]);

  /* ============================================================================
   * Header (currency-aware) with shimmer on refetch
   * ========================================================================== */
  const {
    data: headerRaw,
    isLoading,
    isFetching,
    isRefetching,
  } = useQuery({
    queryKey: ["collection-header", collection.contract, selectedCurrencyId ?? "ETN"],
    queryFn: async () => {
      const q = selectedCurrencyId ? `&currencyId=${encodeURIComponent(selectedCurrencyId)}` : "";
      const res = await fetch(
        `/api/collections/${encodeURIComponent(collection.contract)}?header=1${q}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to load collection header");
      return (await res.json()) as CollectionHeader;
    },
    placeholderData: (prev) => prev ?? collection,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });

  const header: CollectionHeader = headerRaw ?? collection;

  useEffect(() => {
    if (isLoading) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      showLoader("Loading collection…");
      return;
    }
    hideTimer.current = setTimeout(() => hideLoader(), 250);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [isLoading, showLoader, hideLoader]);

  const indexedCount = header.itemsCount ?? 0;
  const supply = header.supply ?? 0;
  const indexing = supply > 0 && indexedCount < supply;

  const [lastIndexed, setLastIndexed] = useState<number>(() =>
    typeof window !== "undefined" ? parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) : 0
  );
  useEffect(() => {
    if (indexedCount > lastIndexed) {
      setLastIndexed(indexedCount);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, String(indexedCount));
      }
    }
    setIsIndexing(indexing);
  }, [indexedCount, lastIndexed, indexing, setIsIndexing]);

  const listedPercentage =
    supply > 0 && (header?.listingActiveCount ?? 0) > 0
      ? ((Number(header!.listingActiveCount) / supply) * 100).toFixed(1)
      : "0";

  const handleCopy = () => {
    navigator.clipboard
      .writeText(header.contract)
      .then(() => toast(`${header.name} contract address copied.`));
  };

  const TABS = [
    {
      label: "Items",
      content: <NFTItemsTab contract={header.contract} collectionName={header.name} />,
    },
  ];

  const shareText =
    collection.description?.slice(0, 120)?.trim() ||
    `Check out ${collection.name} on Panthart`;

  const canBuyFloor =
    (header.floorPrice ?? 0) > 0 && (header.listingActiveCount ?? 0) > 0;

  const [statShimmer, setStatShimmer] = useState(false);
  const prevCurrencyRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevCurrencyRef.current;
    if (prev !== selectedCurrencyId) {
      prevCurrencyRef.current = selectedCurrencyId;
      setStatShimmer(true);
    }
  }, [selectedCurrencyId]);

  useEffect(() => {
    if (!isFetching && !isRefetching && statShimmer) {
      const t = setTimeout(() => setStatShimmer(false), 200);
      return () => clearTimeout(t);
    }
  }, [isFetching, isRefetching, statShimmer]);

  const handleBuyFloor = async () => {
    try {
      const params = new URLSearchParams({
        limit: "5",
        listed: "true",
        includeUnranked: "true",
        sort: "lowToHigh",
      });
      if (selectedCurrencyId) params.set("currencyId", selectedCurrencyId);
      const res = await fetch(
        `/api/collections/${encodeURIComponent(header.contract)}?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Could not fetch floor item");
      const json = await res.json();
      const nfts: any[] = Array.isArray(json?.nfts) ? json.nfts : [];

      let pick =
        nfts.find((n) => (n.listingCurrencySymbol || "ETN") === selectedSymbol) ??
        nfts[0];

      if (!pick?.tokenId) throw new Error("No listed item found");
      router.push(`/collections/${header.contract}/${pick.tokenId}`);
    } catch (e: any) {
      toast.error(e?.message || "Unable to navigate to floor item");
    }
  };

  return (
    <section className="my-5 mb-20 flex-1">
      {/* Breadcrumb — ⤵ wrap fix */}
      <Breadcrumb className="mb-5 mt-2 overflow-x-visible">
        <BreadcrumbList className="flex flex-wrap gap-y-1">
          <BreadcrumbItem>
            <BreadcrumbLink href="/" className="max-w-full whitespace-normal break-words">
              Home
            </BreadcrumbLink>
          </BreadcrumbItem>
          {segments.map((seg, i) => {
            const href = `/${segments.slice(0, i + 1).join("/")}`;
            const isLast = i === segments.length - 1;
            const label = isLast
              ? header.name
              : seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            return (
              <React.Fragment key={href}>
                <BreadcrumbSeparator>
                  <Slash className="w-3.5 h-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem className="max-w-full">
                  {isLast ? (
                    <BreadcrumbPage className="max-w-full whitespace-normal break-words">
                      {label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      href={href}
                      className="max-w-full whitespace-normal break-words"
                    >
                      {label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Cover */}
      {header.coverUrl ? (
        <div className="relative w-full lg:h-72 md:h-48 h-32 rounded-lg overflow-hidden mb-4">
          <Image
            src={header.coverUrl}
            alt={header.name}
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover rounded-lg"
            unoptimized
            priority
          />
        </div>
      ) : (
        <Skeleton className="w-full h-48 lg:h-72 rounded-lg mb-4" />
      )}

      {/* Header */}
      <section className="mt-5 flex flex-col gap-10 lg:flex-row lg:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <div className="relative w-[55px] h-[55px] lg:w-[85px] lg:h-[85px] rounded-md shrink-0">
            {header.logoUrl ? (
              <Image
                src={header.logoUrl}
                alt={header.name}
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover rounded-md"
                unoptimized
                priority
              />
            ) : (
              <Skeleton className="w-full h-full rounded-md" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* ⤵ wrap fix: remove truncate, allow breaking */}
              <h2 className="tracking-widest uppercase font-bold text-[1rem] lg:text-[1.3rem] break-words whitespace-normal leading-tight max-w-full">
                {header.name}
              </h2>

              {isFetching && !isLoading && (
                <span
                  aria-label="Refreshing…"
                  className="inline-block w-3.5 h-3.5 border-2 border-card-foreground/50 border-t-transparent rounded-full animate-spin"
                />
              )}
              {/* verification badge removed */}
            </div>
            <div
              className="cursor-pointer flex items-center gap-2 mt-1"
              onClick={handleCopy}
            >
              <p className="text-[0.85rem] bg-card-foreground/10 hover:bg-card-foreground/20 transition rounded-md px-2 py-1">
                {shortenAddress(header.contract)}
              </p>
              <Copy size={18} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:items-end">
          <TooltipProvider>
            <div className="flex flex-wrap items-center gap-6 justify-start lg:justify-end">
              {header.website && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={header.website} target="_blank" rel="noreferrer">
                      <FaGlobeAfrica size={20} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent><p>Website</p></TooltipContent>
                </Tooltip>
              )}
              {header.instagram && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={header.instagram} target="_blank" rel="noreferrer">
                      <FiInstagram size={20} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent><p>Instagram</p></TooltipContent>
                </Tooltip>
              )}
              {header.x && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={header.x} target="_blank" rel="noreferrer">
                      <BsTwitterX size={20} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent><p>X</p></TooltipContent>
                </Tooltip>
              )}
              {header.telegram && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={header.telegram} target="_blank" rel="noreferrer">
                      <FaTelegramPlane size={20} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent><p>Telegram</p></TooltipContent>
                </Tooltip>
              )}
              {header.discord && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={header.discord} target="_blank" rel="noreferrer">
                      <FaDiscord size={20} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent><p>Discord</p></TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <ShareButton
                      title={header.name}
                      text={shareText}
                      image={header.logoUrl || header.coverUrl}
                      hashtags={["NFT", "ETN", "Panthart"]}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent><p>Share</p></TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          {/* Owner-only actions — responsive */}
          {accountAddress && header.ownerAddress.toLowerCase() === accountAddress && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
              <div className="min-w-0">
                <WithdrawProceedsDialog
                  contract={header.contract}
                  collectionName={header.name}
                  ownerAddress={header.ownerAddress}
                />
              </div>
              <div className="min-w-0">
                <EditCollectionSheet collection={header as any} />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Description & Stats */}
      <section className="mt-5 flex flex-col lg:flex-row gap-5 lg:justify-between">
        <div className="flex flex-col gap-5 w-full lg:w-[60%]">
          <p className="text-[0.85rem] lg:text-[1rem]">
            {fullDesc
              ? header.description
              : header.description?.length! > 250
              ? `${header.description!.slice(0, 250)}…`
              : header.description}
            {header.description?.length! > 250 && (
              <button
                onClick={() => setFullDesc((p) => !p)}
                className="ml-2 text-brand font-bold hover:underline"
              >
                {fullDesc ? "Read Less" : "Read More"}
              </button>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-6">
            {accountAddress && (header.floorPrice ?? 0) > 0 && (header.listingActiveCount ?? 0) > 0 && (
              <Button onClick={handleBuyFloor}>Buy Floor Price</Button>
            )}

            <div>
              <p className="text-[0.85rem]">Owner</p>
              <Link href={`/profile/${header.ownerAddress}`}>
                <Button
                  variant="link"
                  className="font-bold text-[0.85rem] p-0 h-auto leading-none dark:text-brand text-green-500"
                >
                  {shortenAddress(header.ownerAddress)}
                </Button>
              </Link>
            </div>
            <div>
              <p className="text-[0.85rem]">Creator</p>
              <Link href={`/profile/${header.creator.walletAddress}`}>
                <Button
                  variant="link"
                  className="font-bold text-[0.85rem] p-0 h-auto leading-none dark:text-brand text-green-500"
                >
                  {shortenAddress(header.creator.walletAddress)}
                </Button>
              </Link>
            </div>

            <div className="min-w-[72px]">
              <small>Listed</small>
              {statShimmer ? (
                <Skeleton className="h-6 w-12 mt-1" />
              ) : (
                <p className="font-bold">{listedPercentage}%</p>
              )}
            </div>

            {/* Currency Filter */}
            <div className="min-w-[140px]">
              <small className="block text-xs mb-1">Currency</small>
              <Select
                value={selectedCurrencyId ?? "ETN"}
                onValueChange={(val) => {
                  setSelectedCurrencyId(val === "ETN" ? null : val);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="ETN" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem key="ETN" value="ETN">
                    ETN
                  </SelectItem>
                  {currencyOptions
                    .filter((c) => !(c.kind === "NATIVE" && c.symbol.toUpperCase() === "ETN"))
                    .map((c) => (
                      <SelectItem key={c.id!} value={c.id!}>
                        {c.symbol}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[40%] flex flex-col gap-5">
          <div className="flex justify-start lg:justify-end gap-10">
            <div className="text-left lg:text-right">
              <small>Floor Price</small>
              {statShimmer ? (
                <Skeleton className="h-6 w-28 mt-1" />
              ) : (
                <h3 className="font-semibold">
                  {formatNumber(header.floorPrice ?? 0)} {selectedSymbol}
                </h3>
              )}
            </div>
            <div className="text-left lg:text-right">
              <small>Volume</small>
              {statShimmer ? (
                <Skeleton className="h-6 w-28 mt-1" />
              ) : (
                <h3 className="font-semibold">
                  {formatNumber(header.volume ?? 0)} {selectedSymbol}
                </h3>
              )}
            </div>
          </div>

          <div className="flex justify-start lg:justify-end gap-10">
            <div className="text-left lg:text-right">
              <small>Total Supply</small>
              <h3 className="font-semibold">{formatNumber(supply ?? 0)}</h3>
            </div>
            <div className="text-left lg:text-right">
              <small>Owners</small>
              <h3 className="font-semibold">{formatNumber(header.ownersCount ?? 0)}</h3>
            </div>
          </div>
        </div>
      </section>

      {/* Indexing progress (non-blocking) */}
      {indexing && indexedCount < supply && (
        <div className="mt-10 space-y-2">
          <Progress value={(indexedCount / (supply || 1)) * 100} className="h-2" />
          <div className="flex items-center justify-between flex-wrap gap-2 text-sm text-muted-foreground">
            <p>
              Indexing {indexedCount}/{supply} NFTs… (
              {((indexedCount / (supply || 1)) * 100).toFixed(1)}%)
            </p>
          </div>
        </div>
      )}

      {/* Items tab */}
      <section className="mt-10 w-full">
        <TabView tabs={TABS} />
      </section>
    </section>
  );
}
