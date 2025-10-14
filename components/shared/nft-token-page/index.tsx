"use client";

/**
 * NFT Token Page (+ ERC1155 Withdraw for contract owner)
 * Responsive hardening for tiny screens:
 * - Title on its own row on mobile; actions row wraps underneath.
 * - No horizontal overflow anywhere (media/tabs/header protected).
 * - Compact buttons on mobile, all actions shrink-0.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ExternalLink, Flag } from "lucide-react";
import { ethers } from "ethers";

import { Button } from "@/components/ui/button";

import LoaderModal from "@/components/shared/loader-modal";
import ShareButton from "@/components/shared/share-button";
import { useActiveAccount } from "thirdweb/react";

import type { NFTItem, NFTActivity } from "@/lib/types/types";
import type { DisplayGroup, Profile } from "@/lib/types/nft-page";
import { shortenAddress } from "@/lib/utils";

import SellSheet, { CurrencyOption, CurrencyHint } from "@/components/shared/sell-sheet";
import { useLoaderStore } from "@/lib/store/loader-store";

import { marketplace, type Standard } from "@/lib/services/marketplace";
import { toISOFromSeconds } from "@/lib/utils/time";
import { getBrowserSigner, ZERO_ADDRESS } from "@/lib/evm/getSigner";

import { ActionButtons } from "./ActionButtons";
import { BreadcrumbsBar } from "./Breadcrumbs";
import { CreatorOwnerBlock } from "./CreatorOwner";
import { Media } from "./Media";
import { OwnersModal } from "./OwnersModal";
import { PricePanel } from "./PricePanel";
import { ReportDialog } from "./ReportDialog";
import { StatusChips } from "./StatusChips";
import { TabsContainer } from "./TabsContainer";
import { useMarketplaceLive } from "@/lib/hooks/useMarketplaceLive";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";
import WithdrawProceedsDialog1155 from "./WithdrawProceedsDialog1155";

const ERC1155_OWNER_ABI = ["function owner() view returns (address)"];

/* ---------- helpers ---------- */
const ipfsGateway =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY?.replace(/\/?$/, "/") ||
  "https://ipfs.io/ipfs/";
const ipfsToHttp = (u?: string | null) =>
  !u ? "" : u.startsWith("ipfs://") ? ipfsGateway + u.slice(7) : u;

const ERC1155_ABI_BALANCEOF = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
];

const keyOf = (addr?: string | null) =>
  (addr || "").startsWith("0x") ? (addr as string).toLowerCase() : (addr || "");
const eqCI = (a?: string | null, b?: string | null) =>
  keyOf(a) !== "" && keyOf(a) === keyOf(b);

/** lightweight read provider for quick on-chain probes */
function getReadProvider(): ethers.Provider | null {
  const rpc = process.env.NEXT_PUBLIC_RPC_URL;
  if (rpc) return new ethers.JsonRpcProvider(rpc);
  const eth = (globalThis as any)?.ethereum;
  if (eth) return new ethers.BrowserProvider(eth);
  return null;
}

/** probe recent listings to see if *any* active listing exists for the token */
async function probeHasAnyActiveListings(
  collection: string,
  tokenId: string,
  maxToScan: number = 60
): Promise<boolean> {
  try {
    const provider = getReadProvider();
    const mktAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
    if (!provider || !mktAddr) return false;

    const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, provider);
    const nextId: bigint = await mkt.nextListingId();
    if (!nextId || nextId <= 1n) return false;

    const start = nextId - 1n;
    const min = start > BigInt(maxToScan) ? start - BigInt(maxToScan) : 1n;

    for (let id = start; id >= min; id--) {
      const row = await mkt.listings(id);
      if (!row.active) continue;
      if (
        String(row.token).toLowerCase() === collection.toLowerCase() &&
        String(row.tokenId) === String(tokenId)
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** fetch on-chain owner() of an ERC1155 drop (to gate Withdraw button) */
async function fetchErc1155OwnerAddr(contract: string): Promise<string | null> {
  try {
    const provider = getReadProvider();
    if (!provider) return null;
    const c = new ethers.Contract(contract as `0x${string}`, ERC1155_OWNER_ABI, provider);
    const owner: string = await c.owner();
    return (owner || "").toLowerCase();
  } catch {
    return null;
  }
}

export default function NFTTokenPageComponent({
  nft: currentNFT,
  activities,
  creator,
  owner,
  isOrphan,
  displayGroup,
  traitsWithRarity = [],
  rarityScore = 0,
  rarityRank,
  population = 0,
  listQuantity = 0,
  rawMetadata = null,
  erc1155OwnerCount = null,
}: {
  nft: NFTItem;
  activities: NFTActivity[];
  creator: Profile;
  owner: Profile;
  isOrphan: boolean;
  displayGroup: DisplayGroup;
  traitsWithRarity?: any[];
  rarityScore?: number;
  rarityRank?: number | null;
  population?: number;
  listQuantity?: number;
  rawMetadata?: Record<string, any> | null;
  erc1155OwnerCount?: number | null;
}) {
  const router = useRouter();
  const account = useActiveAccount();

  const showLoader = useLoaderStore((s) => s.show);
  const hideLoader = useLoaderStore((s) => s.hide);

  const [mounted, setMounted] = useState(false);
  const [ownersOpen, setOwnersOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [isDropOwner, setIsDropOwner] = useState<boolean>(false);

  useEffect(() => {
    showLoader("Loading NFT…");
    setMounted(true);
  }, [showLoader]);

  useEffect(() => {
    if (mounted) hideLoader();
  }, [mounted, hideLoader]);

  /** probe on-chain owner() for ERC1155 to gate Withdraw button */
  useEffect(() => {
    let cancel = false;
    async function run() {
      if (currentNFT.standard !== "ERC1155" || !account?.address) {
        if (!cancel) setIsDropOwner(false);
        return;
      }
      const ownerAddr = await fetchErc1155OwnerAddr(currentNFT.nftAddress);
      if (!cancel) setIsDropOwner(!!ownerAddr && ownerAddr === account.address.toLowerCase());
    }
    run();
    const id = window.setInterval(run, 25_000);
    return () => {
      cancel = true;
      window.clearInterval(id);
    };
  }, [currentNFT.nftAddress, currentNFT.standard, account?.address]);

  const tokenUriHref = useMemo(() => ipfsToHttp(currentNFT.tokenUri), [currentNFT.tokenUri]);

const crumbs = useMemo(() => {
  const items: Array<
    | { type: "link"; href: string; label: string; title?: string }
    | { type: "page"; label: string; title?: string }
  > = [
    { type: "link", href: "/", label: "Home" },
    { type: "link", href: "/collections", label: "Collections" },
  ];

  if (displayGroup.type === "collection") {
    items.push({
      type: "link",
      href: `/collections/${currentNFT.nftAddress}`,
      label: displayGroup.title,
      title: displayGroup.title,
    });
    items.push({ type: "page", label: currentNFT.tokenId });
  } else {
    const shortAddr = shortenAddress(currentNFT.nftAddress);
    items.push({
      type: "page",
      label: shortAddr,
      title: currentNFT.nftAddress, // full address on hover
    });
    items.push({ type: "page", label: currentNFT.tokenId });
  }
  return items;
}, [displayGroup, currentNFT]);

  /* ---------- on-chain listing/auction snapshots ---------- */
  const [listingSnap, setListingSnap] = useState<{
    id: bigint;
    row: {
      seller: `0x${string}`;
      currency: `0x${string}`;
      price: bigint;
      quantity: bigint;
      start: bigint;
      end: bigint;
      standard: bigint;
    };
  } | null>(null);
  const [erc20Meta, setErc20Meta] = useState<{ symbol: string; decimals: number } | null>(null);

  const [auctionId, setAuctionId] = useState<bigint | null>(null);
  const [auctionSeller, setAuctionSeller] = useState<`0x${string}` | null>(null);
  const [auctionBidsCount, setAuctionBidsCount] = useState<number>(0);
  const [auctionEndSec, setAuctionEndSec] = useState<number | null>(null);
  const [auctionSettled, setAuctionSettled] = useState<boolean>(false);
  const [auctionCurrency, setAuctionCurrency] = useState<{ symbol: string; decimals: number }>({
    symbol: "ETN",
    decimals: 18,
  });

  async function refreshOnChainStates() {
    try {
      const li = await marketplace.readActiveListing({
        collection: currentNFT.nftAddress as `0x${string}`,
        tokenId: BigInt(currentNFT.tokenId),
        standard: currentNFT.standard as Standard,
      });
      setListingSnap(li);

      if (li?.row?.currency && li.row.currency !== ZERO_ADDRESS) {
        try {
          const meta = await marketplace.getErc20Meta(li.row.currency as `0x${string}`);
          setErc20Meta(meta);
        } catch {
          setErc20Meta({ symbol: "ERC20", decimals: 18 });
        }
      } else {
        setErc20Meta(null);
      }

      const au = await marketplace.readActiveAuction({
        collection: currentNFT.nftAddress as `0x${string}`,
        tokenId: BigInt(currentNFT.tokenId),
        standard: currentNFT.standard as Standard,
      });

      if (au) {
        setAuctionId(au.id);
        setAuctionSeller(au.row.seller as `0x${string}`);
        setAuctionBidsCount(Number(au.row.bidsCount ?? 0));
        setAuctionEndSec(Number(au.row.end ? au.row.end : 0n));
        setAuctionSettled(Boolean(au.row.settled));

        let symbol = "ETN";
        let decimals = 18;
        if (au.row.currency && au.row.currency !== ZERO_ADDRESS) {
          try {
            const meta = await marketplace.getErc20Meta(au.row.currency as `0x${string}`);
            symbol = meta.symbol || "ERC20";
            decimals = meta.decimals || 18;
          } catch {}
        }
        setAuctionCurrency({ symbol, decimals });

        const highest =
          au.row.highestBid && au.row.highestBid > 0n
            ? (Number(au.row.highestBid) / 10 ** decimals).toString()
            : null;
        const startH = (Number(au.row.startPrice) / 10 ** decimals).toString();
        const endISO = au.row.end ? new Date(Number(au.row.end) * 1000).toISOString() : null;

        setAuctionInfo((prev) => {
          const base = prev?.auction ?? {};
          return {
            active: true,
            auction: {
              ...(base as any),
              currency: { symbol, decimals },
              amounts: {
                ...(base as any)?.amounts,
                highestBid: highest,
                startPrice: startH,
                minIncrement: (Number(au.row.minIncrement) / 10 ** decimals).toString(),
              },
              endTime: endISO,
            },
          };
        });
      } else {
        setAuctionId(null);
        setAuctionSeller(null);
        setAuctionBidsCount(0);
        setAuctionEndSec(null);
        setAuctionSettled(false);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshOnChainStates();
    const id = window.setInterval(refreshOnChainStates, 25_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNFT.nftAddress, currentNFT.tokenId, currentNFT.standard, account?.address]);

  /* ---------- derived fields ---------- */
  const isListedLiveRaw = !!listingSnap; // 721 snapshot only
  const listedQty = Number(listingSnap?.row?.quantity || 0n);
  const currencyLabel = listingSnap
    ? listingSnap.row.currency === ZERO_ADDRESS
      ? "ETN"
      : erc20Meta?.symbol || "ERC20"
    : "";

  const priceHuman = useMemo(() => {
    if (!listingSnap) return null;
    const decimals = listingSnap.row.currency === ZERO_ADDRESS ? 18 : (erc20Meta?.decimals ?? 18);
    try {
      return (Number(listingSnap.row.price) / 10 ** decimals).toString();
    } catch {
      return null;
    }
  }, [listingSnap, erc20Meta]);

  const listingStartISO = toISOFromSeconds(listingSnap?.row?.start ?? null);
  const listingEndISO =
    listingSnap?.row?.end && listingSnap.row.end !== 0n
      ? toISOFromSeconds(listingSnap.row.end)
      : null;

  const notStartedYet = listingStartISO ? Date.now() < new Date(listingStartISO).getTime() : false;
  const endedAlready  = listingEndISO ? Date.now() > new Date(listingEndISO).getTime() : false;

  const listingSeller = listingSnap?.row?.seller || null;
  const canManageListing =
    !!(listingSeller && account?.address) &&
    listingSeller.toLowerCase() === account.address.toLowerCase();

  const isAuctionLive = !!auctionId;
  const canManageAuction =
    !!(auctionSeller && account?.address) &&
    auctionSeller.toLowerCase() === account.address.toLowerCase();
  const canCancelAuction = canManageAuction && Number(auctionBidsCount || 0) === 0;

  /* ---------- per-seller 1155 checks ---------- */
  const [isListedForMe, setIsListedForMe] = useState<boolean>(false);
  const [onAuctionForMe, setOnAuctionForMe] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMine() {
      if (!account?.address) {
        if (!cancelled) {
          setIsListedForMe(false);
          setOnAuctionForMe(false);
        }
        return;
      }
      try {
        const myLi = await marketplace.readActiveListingForSeller({
          collection: currentNFT.nftAddress as `0x${string}`,
          tokenId: BigInt(currentNFT.tokenId),
          standard: currentNFT.standard as Standard,
          seller: account.address as `0x${string}`,
        });
        if (!cancelled) setIsListedForMe(!!myLi);
      } catch {
        if (!cancelled) setIsListedForMe(false);
      }

      try {
        const myAu = await marketplace.readActiveAuctionForSeller({
          collection: currentNFT.nftAddress as `0x${string}`,
          tokenId: BigInt(currentNFT.tokenId),
          standard: currentNFT.standard as Standard,
          seller: account.address as `0x${string}`,
        });
        if (!cancelled) setOnAuctionForMe(!!myAu);
      } catch {
        if (!cancelled) setOnAuctionForMe(false);
      }
    }

    loadMine();
    const id = window.setInterval(loadMine, 25_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [account?.address, currentNFT.nftAddress, currentNFT.tokenId, currentNFT.standard]);

  /* ---------- API flags via React Query ---------- */
  const {
    hasAnyListings,
    hasAnyAuctions,
    setHasAnyListingsOptimistic,
    setHasAnyAuctionsOptimistic,
    invalidateAll,
  } = useMarketplaceLive({
    contract: currentNFT.nftAddress,
    tokenId: currentNFT.tokenId,
    account: account?.address,
  });

  /* ---------- auction info (API snapshot, minimal) ---------- */
  const [auctionInfo, setAuctionInfo] = useState<{
    active: boolean;
    auction?: {
      highestBid?: number | string | null;
      startPrice?: number | string | null;
      endTime?: string | null;
      currency?: { symbol?: string | null; decimals?: number | null } | null;
      amounts?: {
        startPrice?: string | number | null;
        highestBid?: string | number | null;
        minIncrement?: string | number | null;
        startPriceWei?: string | number | null;
        highestBidWei?: string | number | null;
        minIncrementWei?: string | number | null;
      } | null;
    } | null;
  } | null>(null);

  /* ---------- on-chain probe to drive the quick-link ---------- */
  const [hasAnyOnChainListings, setHasAnyOnChainListings] = useState<boolean>(false);

  useEffect(() => {
    let cancel = false;
    async function runProbe() {
      const ok = await probeHasAnyActiveListings(currentNFT.nftAddress, String(currentNFT.tokenId), 60);
      if (!cancel) setHasAnyOnChainListings(ok);
    }
    runProbe();
    const id = window.setInterval(runProbe, 15000);
    return () => { cancel = true; clearInterval(id); };
  }, [currentNFT.nftAddress, currentNFT.tokenId]);

  /* ---------- composite UI booleans ---------- */
  const is1155 = (currentNFT.standard as Standard) === "ERC1155";

  const hasListingsUI =
    Boolean(hasAnyOnChainListings) ||
    Boolean(isListedLiveRaw) ||
    Boolean(is1155 && isListedForMe);

  const hasAuctionsUI =
    Boolean(hasAnyAuctions) ||
    Boolean(isAuctionLive) ||
    Boolean(is1155 && onAuctionForMe);

  const isListedLive = Boolean(isListedLiveRaw && !endedAlready);

async function addActivity(
  type:
    | "LISTED"
    | "AUCTION_STARTED"
    | "CANCELLED_LISTING"
    | "CANCELLED_AUCTION"
    | "SALE"
    | "TRANSFER",
  from?: string | null,
  to?: string | null,
  priceWei?: string | null,
  currencyAddr?: string | null,
  txHash?: string | null,
  blockNumber?: number | null,
  timestampISO?: string | null
) {
  try {
    await fetch(`/api/nft/${currentNFT.nftAddress}/${currentNFT.tokenId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        fromAddress: from ?? account?.address ?? null,
        toAddress: to ?? null,
        priceWei: priceWei ?? null,
        currencyAddress: currencyAddr ?? null,
        txHash: txHash ?? undefined,
        blockNumber: blockNumber ?? undefined,
        timestampISO: timestampISO ?? undefined,
      }),
    });
  } catch {}
}

  /* ---------- actions ---------- */
  const buyNow = async () => {
    if (is1155) {
      toast.info("Select which seller’s lot to buy.");
      router.push(`/list/${currentNFT.nftAddress}/${currentNFT.tokenId}`);
      return;
    }

    try {
      if (!account?.address) return toast.info("Connect your wallet to continue.");
      if (listingStartISO && Date.now() < new Date(listingStartISO).getTime()) {
        return toast.error("Listing has not started yet.");
      }
      if (listingEndISO && Date.now() > new Date(listingEndISO).getTime()) {
        return toast.error("Listing already ended.");
      }

      showLoader("Buying…");
      setHasAnyListingsOptimistic(false);

      const ret = await marketplace.buyListingJustInTime({
        collection: currentNFT.nftAddress as `0x${string}`,
        tokenId: BigInt(currentNFT.tokenId),
        standard: currentNFT.standard as Standard,
      });
      hideLoader();
  toast.success("Purchase complete");
setHasAnyOnChainListings(false);

      try {
        await fetch("/api/marketplace/listings/attach-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "SOLD",
            contract: currentNFT.nftAddress,
            tokenId: currentNFT.tokenId,
            sellerAddress: listingSeller,
            buyerAddress: account.address,
            txHash: (ret as any)?.txHash,
          }),
        });
      } catch {}

      await refreshOnChainStates();
      await invalidateAll();
      router.refresh();
    } catch (e: any) {
      hideLoader();
      setHasAnyListingsOptimistic(true);
      toast.error(e?.reason || e?.message || "Purchase failed");
    }
  };

  async function onCancelListing() {
    if (!listingSnap?.id) return;
    try {
      showLoader("Cancelling listing…");
      setHasAnyListingsOptimistic(false);

      const ret = await marketplace.cancelListing(listingSnap.id);
      hideLoader();
      toast.success("Listing cancelled");
      void addActivity("CANCELLED_LISTING");
      setHasAnyOnChainListings(false);

      try {
        await fetch("/api/marketplace/listings/attach-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "CANCELLED",
            contract: currentNFT.nftAddress,
            tokenId: currentNFT.tokenId,
            sellerAddress: listingSeller ?? account?.address,
            txHash: (ret as any)?.txHash,
          }),
        });
      } catch {}

      await refreshOnChainStates();
      await invalidateAll();
      router.refresh();
    } catch (e: any) {
      hideLoader();
      setHasAnyListingsOptimistic(true);
      toast.error(e?.message || "Cancel failed");
    }
  }

  async function onCancelAuction() {
    if (!auctionId) return;
    try {
      if (!canCancelAuction) return toast.error("You can only cancel before any bids.");
      showLoader("Cancelling auction…");
      setHasAnyAuctionsOptimistic(false);

      const ret = await marketplace.cancelAuction(auctionId);
      hideLoader();
  toast.success("Auction cancelled");
void addActivity("CANCELLED_AUCTION", account?.address ?? null, null, null, null, (ret as any)?.txHash);

      try {
        await fetch("/api/marketplace/auctions/attach-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "CANCELLED",
            contract: currentNFT.nftAddress,
            tokenId: currentNFT.tokenId,
            sellerAddress: account?.address,
            txHash: (ret as any)?.txHash,
          }),
        });
      } catch {}

      await refreshOnChainStates();
      await invalidateAll();
      router.refresh();
    } catch (e: any) {
      hideLoader();
      setHasAnyAuctionsOptimistic(true);
      toast.error(e?.message || "Cancel failed");
    }
  }

  async function onCleanupExpired() {
    if (!listingSnap?.id) return;
    try {
      showLoader("Ending listing and returning NFT to seller…");
      setHasAnyListingsOptimistic(false);

      const ret = await marketplace.cleanupExpired(listingSnap.id);
      hideLoader();
 toast.success("Listing ended; NFT returned to seller");
void addActivity("CANCELLED_LISTING", account?.address ?? null, null, null, null, (ret as any)?.txHash);
      try {
        await fetch("/api/marketplace/listings/attach-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "EXPIRED",
            contract: currentNFT.nftAddress,
            tokenId: currentNFT.tokenId,
            sellerAddress: listingSeller ?? account?.address,
            txHash: (ret as any)?.txHash,
          }),
        });
      } catch {}

      await refreshOnChainStates();
      await invalidateAll();
      router.refresh();
    } catch (e: any) {
      hideLoader();
      setHasAnyListingsOptimistic(true);
      toast.error(e?.message || "Cleanup failed");
    }
  }

  /** Create/update listing */
  async function handleCreateListing(args: {
    standard: "ERC721" | "ERC1155";
    currency: CurrencyOption;
    price: string;         // TOTAL for 1155
    quantity?: string;
    startTimeISO?: string;
    endTimeISO?: string;
  }) {
    try {
      if (!account?.address) return toast.info("Connect your wallet to continue.");

      if (editMode && listingSnap?.id) {
        showLoader("Cancelling current listing…");
        const cancelRet = await marketplace.cancelListing(listingSnap.id);
        try {
          await fetch("/api/marketplace/listings/attach-tx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "CANCELLED",
              contract: currentNFT.nftAddress,
              tokenId: currentNFT.tokenId,
              sellerAddress: account.address,
              txHash: (cancelRet as any)?.txHash,
            }),
          });
        } catch {}
        await refreshOnChainStates();
        setEditMode(false);
      }

      showLoader("Preparing listing…");
      setHasAnyListingsOptimistic(true);

      const qty =
        args.standard === "ERC721" ? 1n : BigInt(Math.max(1, Number(args.quantity ?? "1") || 1));

      const ret = await marketplace.createListing({
        collection: currentNFT.nftAddress as `0x${string}`,
        tokenId: BigInt(currentNFT.tokenId),
        quantity: qty,
        standard: args.standard as Standard,
        currency: {
          kind: args.currency.kind,
          tokenAddress: (args.currency.tokenAddress ?? undefined) as `0x${string}` | undefined,
          decimals: args.currency.decimals,
          symbol: args.currency.symbol,
        },
        price: args.price,
        startTimeISO: args.startTimeISO,
        endTimeISO: args.endTimeISO,
      });

      try {
        const res = await fetch("/api/marketplace/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contract: currentNFT.nftAddress,
            tokenId: String(currentNFT.tokenId),
            standard: args.standard,
            sellerAddress: account.address,
            currencyId: args.currency.id,
            price: String(args.price),
            quantity: args.quantity,
            startTimeISO: args.startTimeISO,
            endTimeISO: args.endTimeISO,
            txHashCreated: (ret as any)?.txHash ?? undefined,
          }),
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          console.warn("DB save failed:", j?.error || res.statusText);
        }
      } catch (err: any) {
        console.warn("DB save error:", err?.message);
      }

      hideLoader();
      toast.success(editMode ? "Listing updated" : "Listing created");
      setHasAnyOnChainListings(true);
      await refreshOnChainStates();
      await invalidateAll();
      router.refresh();
    } catch (e: any) {
      hideLoader();
      setHasAnyListingsOptimistic(false);
      toast.error(e?.message || "Create listing failed");
      setEditMode(false);
    }
  }

  async function handleCreateAuction(args: {
    standard: "ERC721" | "ERC1155";
    currency: CurrencyOption;
    startPrice: string;
    minIncrement: string;
    quantity?: string;
    startTimeISO?: string;
    endTimeISO: string;
  }) {
    try {
      if (!account?.address) return toast.info("Connect your wallet to continue.");
      showLoader("Preparing auction…");
      setHasAnyAuctionsOptimistic(true);

      const qty =
        args.standard === "ERC721" ? 1n : BigInt(Math.max(1, Number(args.quantity ?? "1") || 1));
      const ret = await marketplace.createAuction({
        collection: currentNFT.nftAddress as `0x${string}`,
        tokenId: BigInt(currentNFT.tokenId),
        quantity: qty,
        standard: args.standard as Standard,
        currency: {
          kind: args.currency.kind,
          tokenAddress: (args.currency.tokenAddress ?? undefined) as `0x${string}` | undefined,
          decimals: args.currency.decimals,
          symbol: args.currency.symbol,
        },
        startPrice: args.startPrice,
        minIncrement: args.minIncrement,
        startTimeISO: args.startTimeISO,
        endTimeISO: args.endTimeISO,
      });

      try {
        await fetch("/api/marketplace/auctions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contract: currentNFT.nftAddress,
            tokenId: String(currentNFT.tokenId),
            standard: args.standard,
            sellerAddress: account.address,
            currencyId: args.currency.id,
            startPrice: args.startPrice,
            minIncrement: args.minIncrement,
            quantity: args.quantity,
            startTimeISO: args.startTimeISO,
            endTimeISO: args.endTimeISO,
            txHashCreated: (ret as any)?.txHash ?? undefined,
          }),
        });
      } catch {}

      hideLoader();
      toast.success("Auction created");
      await refreshOnChainStates();
      await invalidateAll();
      router.refresh();
    } catch (e: any) {
      hideLoader();
      setHasAnyAuctionsOptimistic(false);
      toast.error(e?.message || "Create auction failed");
    }
  }

  async function onFinalizeAuction() {
    if (!auctionId) return;
    try {
      showLoader("Finalizing auction…");
      const txHash = await marketplace.finalizeAuction(auctionId);
      hideLoader();
     toast.success("Auction finalized");

      try {
        await fetch("/api/marketplace/auctions/attach-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "FINALIZED",
            contract: currentNFT.nftAddress,
            tokenId: currentNFT.tokenId,
            txHash,
          }),
        });
      } catch {}

      await refreshOnChainStates();
      await invalidateAll();
      router.refresh();
    } catch (e: any) {
      hideLoader();
      toast.error(e?.reason || e?.message || "Finalize failed");
    }
  }

  const shareTitle = currentNFT.name || `${displayGroup.title} #${currentNFT.tokenId}`;
  const shareText =
    (currentNFT.description && currentNFT.description.slice(0, 120)) ||
    `Check out ${shareTitle} on Panthart`;
  const shareImage = typeof currentNFT.image === "string" ? currentNFT.image : "";

  const currencyHint: CurrencyHint | undefined = listingSnap
    ? (listingSnap.row.currency === ZERO_ADDRESS
        ? { kind: "NATIVE" }
        : { kind: "ERC20", tokenAddress: String(listingSnap.row.currency) })
    : undefined;

  const marketplaceAddr = (process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS || "");

  /* ---------- ERC1155 balance ---------- */
  const [my1155Balance, setMy1155Balance] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function loadBalance() {
      try {
        if (currentNFT.standard !== "ERC1155") {
          if (!cancelled) setMy1155Balance(0);
          return;
        }
        if (!account?.address) {
          if (!cancelled) setMy1155Balance(0);
          return;
        }
        const { signer } = await getBrowserSigner();
        const provider = signer.provider;
        const c = new ethers.Contract(
          currentNFT.nftAddress as `0x${string}`,
          ERC1155_ABI_BALANCEOF,
          provider
        );
        const bal: bigint = await c.balanceOf(account.address, BigInt(currentNFT.tokenId));
        if (!cancelled) setMy1155Balance(Number(bal));
      } catch {
        if (!cancelled) setMy1155Balance(0);
      }
    }
    loadBalance();
  }, [
    account?.address,
    currentNFT.nftAddress,
    currentNFT.tokenId,
    currentNFT.standard,
    listingSnap?.id,
    auctionId,
  ]);

  const isOwnerOrHolderConnected = Boolean(
    account?.address &&
      (
        (currentNFT.standard === "ERC1155"
          ? my1155Balance > 0
          : owner?.walletAddress?.toLowerCase?.() === account.address.toLowerCase()
        )
        ||
        listingSeller?.toLowerCase?.() === account.address.toLowerCase()
        ||
        auctionSeller?.toLowerCase?.() === account.address.toLowerCase()
      )
  );

  const showFinalizeAuction =
    Boolean(auctionId) &&
    Boolean(auctionEndSec && Math.floor(Date.now() / 1000) > auctionEndSec) &&
    !auctionSettled;

  /* ---- React to wallet changes (invalidate queries) ---- */
  useEffect(() => {
    const eth = (globalThis as any).ethereum;
    if (!eth?.on) return;
    const onAccounts = () => invalidateAll();
    const onChain = () => invalidateAll();
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      try {
        eth.removeListener("accountsChanged", onAccounts);
        eth.removeListener("chainChanged", onChain);
      } catch {}
    };
  }, [invalidateAll]);

  return (
    <section className="mt-8 mb-20 w-full max-w-full overflow-x-hidden">
      <LoaderModal />

   {/* Breadcrumbs (mobile-safe horizontal scroll) */}
<div className="w-full max-w-full overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
  <BreadcrumbsBar items={crumbs} />
</div>


      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 w-full max-w-full">
        {/* Media */}
     <div className="lg:col-span-5 w-full max-w-full min-w-0">
          {/* protect from horizontal overflow on smallest screens */}
          <div className="w-full max-w-full overflow-hidden rounded-xl border border-border/50 bg-muted/5">
            <Media
              src={currentNFT.image as string}
              alt={currentNFT.name}
              isVideo={/\.mp4|\.mov|\.webm|\.ogg|\.m4v/i.test(String(currentNFT.image))}
            />
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-7 flex flex-col gap-6 w-full max-w-full min-w-0">

          {/* Header & quick actions
              - Column on mobile (title first, actions below)
              - Row on md+ */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 sm:gap-4 w-full">
            {/* Title / meta */}
            <div className="min-w-0 flex-1 order-1">
              {displayGroup.type === "collection" ? (
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground max-w-full">
                  {displayGroup.coverImage ? (
                    <Image
                      src={displayGroup.coverImage}
                      alt={displayGroup.title}
                      width={18}
                      height={18}
                      className="rounded-full"
                      unoptimized
                    />
                  ) : null}
                  <Link
                    href={`/collections/${currentNFT.nftAddress}`}
                    className="hover:underline truncate"
                    title={displayGroup.title}
                  >
                    <span className="truncate">{displayGroup.title}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(currentNFT.nftAddress);
                      toast.success("Contract copied");
                    }}
                    className="inline-flex items-center opacity-70 hover:opacity-100 shrink-0"
                    aria-label="Copy contract address"
                    title="Copy contract address"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <span title={currentNFT.nftAddress}>{shortenAddress(currentNFT.nftAddress)}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(currentNFT.nftAddress);
                      toast.success("Contract copied");
                    }}
                    className="inline-flex items-center opacity-70 hover:opacity-100 shrink-0"
                    aria-label="Copy contract address"
                    title="Copy contract address"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}

              <h1 className="text-2xl md:text-3xl font-semibold leading-tight break-words mt-3">
                {currentNFT.name}
              </h1>

              {currentNFT.description && (
                <p className="mt-3 text-sm text-muted-foreground line-clamp-3">
                  {currentNFT.description}
                </p>
              )}

              <div className="mt-2">
                <StatusChips
                  standard={currentNFT.standard ?? "ERC721"}
                  royaltyBps={currentNFT.royaltyBps ?? 0}
                  isListedLive={isListedLive}
                  onAuction={Boolean(isAuctionLive || (auctionInfo?.active ?? false))}
                  rarity={{ score: rarityScore, rank: rarityRank ?? undefined, population }}
                />
              </div>
            </div>

            {/* Quick actions (full row on mobile) */}
            <div className="order-2 w-full md:w-auto flex items-center gap-2 flex-wrap md:justify-end pt-2 md:pt-0">
              <div className="shrink-0">
                <ShareButton
                  title={shareTitle}
                  text={shareText}
                  image={shareImage}
                  hashtags={["NFT", "ETN", "Panthart"]}
                />
              </div>

              {currentNFT.standard === "ERC1155" && isDropOwner && (
                <WithdrawProceedsDialog1155
                  contract={currentNFT.nftAddress}
                  label={displayGroup.title || currentNFT.name || "ERC1155 Drop"}
                  className="h-9 px-3 sm:px-4 shrink-0"
                />
              )}

              {account?.address && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setReportOpen(true)}
                  aria-label="Report NFT"
                  title="Report NFT"
                  className="shrink-0"
                >
                  <Flag className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Creator / Owner / Seller */}
          <CreatorOwnerBlock
            nft={currentNFT}
            creator={creator}
            owner={owner}
            listingSeller={listingSeller}
            auctionSeller={auctionSeller}
            isListedLive={isListedLive}
            isAuctionLive={isAuctionLive}
            marketplaceAddress={marketplaceAddr}
            erc1155OwnerCount={erc1155OwnerCount ?? null}
            onOpenOwners={() => setOwnersOpen(true)}
          />

          {/* Quick links — on-chain driven */}
          <div className="flex flex-wrap items-center gap-2">
            {hasListingsUI && (
              <Button asChild variant="outline" title="View all active listings for this token" className="shrink-0">
                <Link href={`/list/${currentNFT.nftAddress}/${currentNFT.tokenId}`} prefetch={false}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View all listings
                </Link>
              </Button>
            )}
            {hasAuctionsUI && (
              <Button asChild variant="outline" title="View all active auctions for this token" className="shrink-0">
                <Link href={`/auctions/${currentNFT.nftAddress}/${currentNFT.tokenId}`} prefetch={false}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View auctions
                </Link>
              </Button>
            )}
          </div>

          {/* Price panel — only for 721 */}
          {currentNFT.standard !== "ERC1155" && (
            <PricePanel
              isListedLive={hasListingsUI}
              priceHuman={priceHuman}
              currencyLabel={currencyLabel}
              listedQty={listedQty}
              listingStartISO={listingStartISO}
              listingEndISO={listingEndISO}
              auctionInfo={auctionInfo}
            />
          )}

          {/* Actions */}
          <ActionButtons
            isListedLive={isListedLive}
            isListedForMe={isListedForMe}
            onAuctionForMe={onAuctionForMe}
            onAuction={Boolean(isAuctionLive || (auctionInfo?.active ?? false))}
            canManage={canManageListing}
            canManageAuction={canManageAuction}
            canCancelAuction={canCancelAuction}
            hasAuctionId={Boolean(auctionId)}
            isOwnerConnected={Boolean(isOwnerOrHolderConnected)}
            disabledBuy={!isListedLive || (listingStartISO ? Date.now() < new Date(listingStartISO).getTime() : false)}
            showEndCleanup={!isListedLive && Boolean(listingEndISO) && !!listingSnap?.id}
            onBuyNow={buyNow}
            onOpenSell={() => { setSellOpen(true); setEditMode(false); }}
            onCancelListing={onCancelListing}
            onEditListing={() => { setEditMode(true); setSellOpen(true); }}
            onCleanupExpired={onCleanupExpired}
            onCancelAuction={onCancelAuction}
            showFinalizeAuction={
              Boolean(auctionId) &&
              Boolean(auctionEndSec && Math.floor(Date.now() / 1000) > auctionEndSec) &&
              !auctionSettled
            }
            onFinalizeAuction={onFinalizeAuction}
          />

          {/* Token URI */}
          {currentNFT.tokenUri && tokenUriHref && (
            <div className="pointer-events-none">
              <Link
                href={tokenUriHref}
                target="_blank"
                className="inline-flex items-center text-brandsec dark:text-brand hover:underline font-semibold text-sm pointer-events-auto"
              >
                View Token URI <ExternalLink className="inline-block ml-1" size={14} />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-12 w-full max-w-full overflow-x-hidden">
        <TabsContainer
          nft={currentNFT}
          displayGroup={displayGroup}
          traitsWithRarity={traitsWithRarity}
          rarityScore={rarityScore}
          rarityRank={rarityRank ?? undefined}
          population={population}
          rawMetadata={rawMetadata}
        />
      </div>

      {/* Owners (1155) */}
      {currentNFT.standard === "ERC1155" && (
        <OwnersModal
          open={ownersOpen}
          onOpenChange={setOwnersOpen}
          contract={currentNFT.nftAddress}
          tokenId={currentNFT.tokenId}
        />
      )}

      {/* Report */}
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        contract={currentNFT.nftAddress}
        tokenId={currentNFT.tokenId}
        reporterAddress={account?.address}
        onSuccess={() => router.refresh()}
      />

      {/* Sell sheet */}
      <SellSheet
        open={sellOpen}
        onOpenChange={(v) => { setSellOpen(v); if (!v) setEditMode(false); }}
        standard={currentNFT.standard as any}
        contract={currentNFT.nftAddress}
        tokenId={currentNFT.tokenId}
        disableAuctionTab={editMode}
        defaultPrice={
          editMode && priceHuman
            ? currentNFT.standard === "ERC1155" && listedQty > 0
              ? String(Number(priceHuman) / Math.max(1, listedQty))
              : String(priceHuman)
            : "1"
        }
        defaultQty={editMode ? String(listedQty || 1) : "1"}
        defaultStartISO={editMode ? (listingStartISO || "") : ""}
        defaultEndISO={editMode ? (listingEndISO || "") : ""}
        initialCurrencyHint={editMode ? currencyHint : undefined}
        max1155Qty={currentNFT.standard === "ERC1155" ? my1155Balance : undefined}
        your1155Balance={currentNFT.standard === "ERC1155" ? my1155Balance : undefined}
        onCreateListing={async (p) => {
          await handleCreateListing({
            standard: p.standard,
            currency: p.currency,
            price: p.price,
            quantity: p.quantity,
            startTimeISO: p.startTimeISO,
            endTimeISO: p.endTimeISO,
          });
        }}
        onCreateAuction={async (p) => {
          await handleCreateAuction({
            standard: p.standard,
            currency: p.currency,
            startPrice: p.startPrice,
            minIncrement: p.minIncrement,
            quantity: p.quantity,
            startTimeISO: p.startTimeISO,
            endTimeISO: p.endTimeISO,
          });
        }}
      />
    </section>
  );
}
