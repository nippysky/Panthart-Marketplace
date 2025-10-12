"use client";

/**
 * NFT Auction Page (by auctionId)
 * - Reads base data from /api/auction/:auctionId (+ /bids)
 * - Uses on-chain snapshot; for ERC1155 we query by seller to avoid false negatives.
 * - SSE topic remains DB auction id
 * - Optimistic UI preserved
 * - Boots from SSR `initialAuction` + full page skeleton gate (no flicker)
 * - NEW: disables bidding until the start time; shows "Starts In" until then
 * - Media container supports images + video (mp4/webm/ogg/mov) + gifs
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, Clock, Copy, RefreshCw, Share2, XCircle } from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import { ethers } from "ethers";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { ZERO_ADDRESS, getBrowserSigner } from "@/lib/evm/getSigner";
import { marketplace, type Standard } from "@/lib/services/marketplace";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";
import { useAuctionSSE } from "@/lib/hooks/useAuctionSSE";
import { useLoaderStore } from "@/lib/store/loader-store";

/* ----------------------- Full-page skeleton ----------------------- */
function AuctionSkeleton() {
  return (
    <section className="flex-1 py-6 sm:py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        {/* Media skeleton */}
        <div className="lg:col-span-5">
          <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-muted/50">
            <Skeleton className="w-full h-full animate-pulse" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Skeleton className="h-4" />
            <Skeleton className="h-4" />
            <Skeleton className="h-4 col-span-2" />
          </div>
        </div>

        {/* Right column skeleton */}
        <div className="lg:col-span-7 flex flex-col gap-5 sm:gap-6">
          <div>
            <Skeleton className="h-8 w-3/4" />
            <div className="mt-2 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>

          <div className="border rounded-2xl p-4 sm:p-5 shadow-sm bg-background/60">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-6 w-48" />
            </div>
            <div className="mt-5 border rounded-xl p-3 sm:p-4">
              <Skeleton className="h-10 w-full" />
              <div className="mt-3 flex gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
          </div>

          <div className="border rounded-2xl p-4 sm:p-5 shadow-sm bg-background/60">
            <Skeleton className="h-6 w-28" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------- Types ----------------------- */

type NftLite = {
  name?: string | null;
  image?: string | null;
  description?: string | null;
  standard?: Standard | "ERC721" | "ERC1155";
  royaltyBps?: number | null;
  ownerWallet?: string | null;
  contract?: string | null;
  tokenId?: string | null;
  /** for ERC1155 polish */
  quantity?: number | null;
};

type ConfirmedBidRow = {
  bidder: string;
  amountHuman: string;
  time: number; // ms
  txHash?: string;
  pending?: false;
  timeConfirmed?: number;
  bidderProfile?: {
    walletAddress: string;
    username: string | null;
    imageUrl: string | null;
  } | null;
};
type PendingBidRow = {
  bidder: string;
  amountHuman: string;
  time: number; // ms
  txHash: string;
  pending: true;
};

type BidderMeta = {
  wallet: string; // original casing for display
  username?: string | null;
  avatarUrl?: string | null;
};

/* ----------------------- util (case-insensitive) ----------------------- */

const keyOf = (addr?: string | null) =>
  (addr || "").startsWith("0x") ? (addr as string).toLowerCase() : (addr || "");

const eqCI = (a?: string | null, b?: string | null) =>
  keyOf(a) !== "" && keyOf(a) === keyOf(b);

function msParts(ms: number) {
  const clamp = Math.max(0, ms);
  const d = Math.floor(clamp / 86400000);
  const h = Math.floor((clamp % 86400000) / 3600000);
  const m = Math.floor((clamp % 3600000) / 60000);
  const s = Math.floor((clamp % 60000) / 1000);
  return { d, h, m, s };
}

function mediaKind(url?: string | null): "video" | "image" | "unknown" {
  if (!url) return "unknown";
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|ogg|mov)$/.test(clean)) return "video";
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(clean)) return "image";
  return "image";
}

const dicebear = (addr: string) =>
  `https://api.dicebear.com/7.x/identicon/svg?seed=${addr}`;

/* ====================================================================== */

export default function NFTAuctionPageComponent({
  initialAuction,
}: {
  initialAuction?: any | null;
}) {
  const pathname = usePathname();
  const account = useActiveAccount();
  const loader = useLoaderStore();

  // route -> /auction/:auctionId
  const auctionIdParam = useMemo(() => {
    const segs = pathname.split("/").filter(Boolean);
    return segs[0] === "auction" ? segs[1] : segs[segs.length - 1];
  }, [pathname]);

  /* --------------------------------
   * Base state
   * -------------------------------- */
  const [booted, setBooted] = useState<boolean>(!!initialAuction); // gate UI until we have data

  const [nft, setNft] = useState<NftLite | null>(null);
  const [apiAuctionSeller, setApiAuctionSeller] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  // Contract/Token resolved from API (needed for on-chain snapshot)
  const [contract, setContract] = useState<string>("");
  const [tokenId, setTokenId] = useState<string>("");

  // DB ids for SSE + /api/pending-actions
  const [auctionIdDb, setAuctionIdDb] = useState<string | null>(null);
  const [currencyIdDb, setCurrencyIdDb] = useState<string | null>(null);

  // On-chain id (numeric), when present
  const [auctionIdOnChain, setAuctionIdOnChain] = useState<string | null>(null);

  // Bidder profiles cache (keyed case-insensitively, but stores original values)
  const bidderCache = useRef<Map<string, BidderMeta>>(new Map());

  const [auctionSnap, setAuctionSnap] = useState<{
    currencyAddress: string;
    currencySymbol: string;
    currencyDecimals: number;
    startISO: string | null;
    endISO: string | null;
    highestBidHuman: string | null;
    highestBidder?: string | null;
    startPriceHuman: string | null;
    minIncrementHuman: string | null;
    active: boolean;
    seller: string | null;
    bidsCount: number;
  }>({
    currencyAddress: ZERO_ADDRESS,
    currencySymbol: "ETN",
    currencyDecimals: 18,
    startISO: null,
    endISO: null,
    highestBidHuman: null,
    highestBidder: null,
    startPriceHuman: null,
    minIncrementHuman: null,
    active: false,
    seller: null,
    bidsCount: 0,
  });

  const decimalsRef = useRef(18);

  /* ---------- Seed from SSR on first render ---------- */
  useEffect(() => {
    if (!initialAuction) return;

    const a = initialAuction;

    // Basic NFT/meta for UI
    const nftLite: NftLite = {
      name: a?.nft?.name ?? null,
      image: a?.nft?.image ?? null,
      description: a?.nft?.description ?? null,
      standard: (a?.nft?.standard ?? "ERC721") as Standard,
      royaltyBps: a?.nft?.royaltyBps ?? null,
      ownerWallet: a?.owner?.walletAddress ?? null, // escrow badge
      contract: a?.nft?.contract ?? null,
      tokenId: a?.nft?.tokenId ?? null,
      quantity: a?.quantity ?? null, // edition size
    };
    setNft(nftLite);

    // Wire contract/tokenId for chain reads
    if (a?.nft?.contract) setContract(a.nft.contract);
    if (a?.nft?.tokenId) setTokenId(a.nft.tokenId);

    // Seller/currency ids for SSE + pending actions
    setApiAuctionSeller(a?.sellerAddress ?? null);
    setAuctionIdDb(a?.id ?? auctionIdParam);
    setCurrencyIdDb(a?.currency?.id ?? null);

    // Seed snapshot
    const currencyAddress = a?.currency?.tokenAddress ?? ZERO_ADDRESS;
    const currencySymbol = a?.currency?.symbol ?? (currencyAddress === ZERO_ADDRESS ? "ETN" : "ERC20");
    const currencyDecimals = a?.currency?.decimals ?? (currencyAddress === ZERO_ADDRESS ? 18 : 18);
    decimalsRef.current = currencyDecimals;

    setAuctionSnap((s) => ({
      ...s,
      currencyAddress,
      currencySymbol,
      currencyDecimals,
      startISO: a?.startTime ?? null,
      endISO: a?.endTime ?? null,
      highestBidHuman: a?.amounts?.highestBid ?? null,
      highestBidder: a?.highestBidder ?? null,
      startPriceHuman: a?.amounts?.startPrice ?? null,
      minIncrementHuman: a?.amounts?.minIncrement ?? null,
      active: a?.status === "ACTIVE",
      seller: a?.sellerAddress ?? null,
      bidsCount: a?.bidsCount ?? s.bidsCount ?? 0,
    }));

    setBooted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAuction, auctionIdParam]);

  /* --------------------------------
   * Load auction by ID (client) — skipped if SSR provided it
   * -------------------------------- */
  useEffect(() => {
    if (initialAuction) return; // avoid double paint/fetch

    let cancel = false;

    async function loadAuctionById() {
      if (!auctionIdParam) return;
      try {
        const r = await fetch(`/api/auction/${auctionIdParam}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (cancel) return;

        const a = j?.auction;
        if (!a) return;

        const nftLite: NftLite = {
          name: a?.nft?.name ?? null,
          image: a?.nft?.image ?? null,
          description: a?.nft?.description ?? null,
          standard: (a?.nft?.standard ?? "ERC721") as Standard,
          royaltyBps: a?.nft?.royaltyBps ?? null,
          ownerWallet: a?.owner?.walletAddress ?? null,
          contract: a?.nft?.contract ?? null,
          tokenId: a?.nft?.tokenId ?? null,
          quantity: a?.quantity ?? null,
        };
        setNft(nftLite);

        if (a?.nft?.contract) setContract(a.nft.contract);
        if (a?.nft?.tokenId) setTokenId(a.nft.tokenId);

        setApiAuctionSeller(a?.sellerAddress ?? null);
        setAuctionIdDb(a?.id ?? auctionIdParam);
        setCurrencyIdDb(a?.currency?.id ?? null);

        const currencyAddress = a?.currency?.tokenAddress ?? ZERO_ADDRESS;
        const currencySymbol = a?.currency?.symbol ?? (currencyAddress === ZERO_ADDRESS ? "ETN" : "ERC20");
        const currencyDecimals = a?.currency?.decimals ?? (currencyAddress === ZERO_ADDRESS ? 18 : 18);
        decimalsRef.current = currencyDecimals;

        setAuctionSnap((s) => ({
          ...s,
          currencyAddress,
          currencySymbol,
          currencyDecimals,
          startISO: a?.startTime ?? null,
          endISO: a?.endTime ?? null,
          highestBidHuman: a?.amounts?.highestBid ?? null,
          highestBidder: a?.highestBidder ?? null,
          startPriceHuman: a?.amounts?.startPrice ?? null,
          minIncrementHuman: a?.amounts?.minIncrement ?? null,
          active: a?.status === "ACTIVE",
          seller: a?.sellerAddress ?? null,
          bidsCount: a?.bidsCount ?? s.bidsCount ?? 0,
        }));

        setBooted(true);
      } catch {
        /* noop */
      }
    }

    loadAuctionById();
    return () => {
      cancel = true;
    };
  }, [auctionIdParam, initialAuction]);

  /* --------------------------------
   * On-chain auction snapshot (secondary/authoritative)
   *  - For ERC1155: read by SELLER to avoid false "not found"
   * -------------------------------- */
  useEffect(() => {
    let cancel = false;

    async function readAuctionOnChain() {
      try {
        if (!contract || !tokenId || !nft?.standard) return;

        const au =
          nft?.standard === "ERC1155" && apiAuctionSeller
            ? await marketplace.readActiveAuctionForSeller({
                collection: contract as `0x${string}`,
                tokenId: BigInt(tokenId),
                standard: nft.standard as Standard,
                seller: apiAuctionSeller as `0x${string}`,
              })
            : await marketplace.readActiveAuction({
                collection: contract as `0x${string}`,
                tokenId: BigInt(tokenId),
                standard: nft.standard as Standard,
              });

        if (cancel) return;

        if (!au) {
          setAuctionIdOnChain(null);
          setAuctionSnap((s) => ({
            ...s,
            seller: apiAuctionSeller ?? s.seller ?? null,
            bidsCount: s.bidsCount || 0,
            highestBidder: s.highestBidder ?? null,
          }));
          return;
        }

        const idStr = String(au.id);
        setAuctionIdOnChain(idStr);

        let currencyAddress = String(au.row.currency);
        let currencySymbol = currencyAddress === ZERO_ADDRESS ? "ETN" : (auctionSnap.currencySymbol || "ERC20");
        let currencyDecimals = currencyAddress === ZERO_ADDRESS ? 18 : auctionSnap.currencyDecimals || 18;

        if (currencyAddress !== ZERO_ADDRESS) {
          try {
            const meta = await marketplace.getErc20Meta(currencyAddress as `0x${string}`);
            currencySymbol = meta.symbol || currencySymbol;
            currencyDecimals = meta.decimals || currencyDecimals;
          } catch {
            /* ignore */
          }
        }
        decimalsRef.current = currencyDecimals;

        const toHuman = (x?: bigint | null) =>
          x == null ? null : String(Number(x) / 10 ** currencyDecimals);

        const startISO =
          au.row.start ? new Date(Number(au.row.start) * 1000).toISOString() : null;
        const endISO =
          au.row.end ? new Date(Number(au.row.end) * 1000).toISOString() : null;

        setAuctionSnap((s) => ({
          ...s,
          currencyAddress,
          currencySymbol,
          currencyDecimals,
          startISO,
          endISO,
          highestBidHuman:
            au.row.highestBid && au.row.highestBid > 0n ? toHuman(au.row.highestBid) : s.highestBidHuman,
          highestBidder: au.row.highestBidder ? String(au.row.highestBidder) : s.highestBidder ?? null,
          startPriceHuman: toHuman(au.row.startPrice) ?? s.startPriceHuman,
          minIncrementHuman: toHuman(au.row.minIncrement) ?? s.minIncrementHuman,
          active: true,
          seller: apiAuctionSeller ?? String(au.row.seller ?? "") ?? s.seller ?? null,
          bidsCount: Number(au.row.bidsCount || s.bidsCount || 0),
        }));
      } catch {
        if (!cancel) {
          setAuctionIdOnChain(null);
          setAuctionSnap((s) => ({
            ...s,
            seller: apiAuctionSeller ?? s.seller ?? null,
            bidsCount: s.bidsCount || 0,
            highestBidder: s.highestBidder ?? null,
          }));
        }
      }
    }

    readAuctionOnChain();
    return () => {
      cancel = true;
    };
  }, [contract, tokenId, nft?.standard, apiAuctionSeller]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --------------------------------
   * Confirmed bids (REST) + PENDING (SSE)
   * -------------------------------- */
  const [confirmedBids, setConfirmedBids] = useState<ConfirmedBidRow[]>([]);
  const [pendingBids, setPendingBids] = useState<PendingBidRow[]>([]);

  const warmMeta = (wallet: string, meta?: { username?: string | null; imageUrl?: string | null }) => {
    const k = keyOf(wallet);
    if (!k) return;
    const existing = bidderCache.current.get(k);
    if (existing) {
      bidderCache.current.set(k, {
        wallet: existing.wallet,
        username: meta?.username ?? existing.username ?? null,
        avatarUrl: meta?.imageUrl ?? existing.avatarUrl ?? dicebear(existing.wallet),
      });
    } else {
      bidderCache.current.set(k, {
        wallet,
        username: meta?.username ?? null,
        avatarUrl: meta?.imageUrl ?? dicebear(wallet),
      });
    }
  };

  async function fetchRecentBids() {
    try {
      if (!auctionIdParam) return;
      const r = await fetch(`/api/auction/${auctionIdParam}/bids`, { cache: "no-store" });
      if (!r.ok) return;
      const j: any = await r.json();
      const rowsRaw: any[] = Array.isArray(j?.bids) ? j.bids : [];
      const rows: ConfirmedBidRow[] = rowsRaw.map((b) => ({
        bidder: b.bidder,
        amountHuman: b.amountHuman,
        time: b.time,
        txHash: b.txHash,
        pending: false,
        bidderProfile: b.bidderProfile ?? null,
      }));
      setConfirmedBids(rows.slice(0, 200));

      for (const row of rows) {
        if (row.bidderProfile) {
          warmMeta(row.bidderProfile.walletAddress, {
            username: row.bidderProfile.username,
            imageUrl: row.bidderProfile.imageUrl ?? undefined,
          });
        } else {
          warmMeta(row.bidder);
        }
      }
      if (auctionSnap.highestBidder) warmMeta(auctionSnap.highestBidder);
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    if (!auctionIdParam) return;
    fetchRecentBids();
    const id = window.setInterval(fetchRecentBids, 25_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionIdParam]);

  // Merge: de-dupe by txHash (or bidder-time)
  const mergedBids = useMemo(() => {
    const map = new Map<string, ConfirmedBidRow | PendingBidRow>();
    const keyFor = (b: any) =>
      b.txHash && typeof b.txHash === "string" ? b.txHash : `${keyOf(b.bidder)}-${b.time}`;
    pendingBids.forEach((b) => map.set(keyFor(b), b));
    confirmedBids.forEach((b) => map.set(keyFor(b), b));
    return Array.from(map.values())
      .sort((a, b) => (b.time || 0) - (a.time || 0))
      .slice(0, 50);
  }, [pendingBids, confirmedBids]);

  /* --------------------------------
   * Live SSE wiring (by DB auction id)
   * -------------------------------- */
  useAuctionSSE(auctionIdDb ?? undefined, account?.address, {
    onReady: () => {},
    onBidPending: (ev) => {
      if (!ev?.auctionId || String(ev.auctionId) !== String(auctionIdDb ?? "")) return;
      const decimals = decimalsRef.current;
      const human = ethers.formatUnits(ev.amount || "0", decimals);
      setPendingBids((rows): PendingBidRow[] => {
        if (rows.some((r) => eqCI(r.txHash, ev.txHash))) return rows;
        const item: PendingBidRow = {
          bidder: ev.from,
          amountHuman: human,
          time: ev.at || Date.now(),
          txHash: ev.txHash,
          pending: true,
        };
        warmMeta(ev.from);
        return [item, ...rows].slice(0, 60);
      });
      setAuctionSnap((s) => ({
        ...s,
        highestBidHuman:
          !s.highestBidHuman || Number(human) > Number(s.highestBidHuman) ? human : s.highestBidHuman,
        bidsCount: (s.bidsCount || 0) + 1,
      }));
    },
    onBidConfirmed: (ev) => {
      if (!ev?.auctionId || String(ev.auctionId) !== String(auctionIdDb ?? "")) return;
      const decimals = decimalsRef.current;
      const human = ethers.formatUnits(ev.amount || "0", decimals);
      setPendingBids((rows) => rows.filter((r) => !eqCI(r.txHash, ev.txHash)));
      setConfirmedBids((rows) => [
        {
          bidder: ev.from,
          amountHuman: human,
          time: ev.at || Date.now(),
          txHash: ev.txHash,
          pending: false,
          timeConfirmed: Date.now(),
        },
        ...rows,
      ]);
      warmMeta(ev.from);
      setAuctionSnap((s) => ({
        ...s,
        highestBidHuman:
          !s.highestBidHuman || Number(human) > Number(s.highestBidHuman) ? human : s.highestBidHuman,
        highestBidder: ev.from,
      }));
    },
    onBidFailed: (ev) => {
      if (!ev?.auctionId || String(ev.auctionId) !== String(auctionIdDb ?? "")) return;
      setPendingBids((rows) => rows.filter((r) => !eqCI(r.txHash, ev.txHash)));
    },
    onAuctionExtended: (ev) => {
      if (!ev?.auctionId || String(ev.auctionId) !== String(auctionIdDb ?? "")) return;
      const endISO = new Date(Number(ev.newEndTimeSec) * 1000).toISOString();
      setAuctionSnap((s) => ({ ...s, endISO }));
    },
    onAuctionSettled: (ev) => {
      if (!ev?.auctionId || String(ev.auctionId) !== String(auctionIdDb ?? "")) return;
      const decimals = decimalsRef.current;
      const priceHuman = ev?.price ? ethers.formatUnits(ev.price, decimals) : null;
      setAuctionIdOnChain(null); // hide manage controls immediately
      setAuctionSnap((s) => ({ ...s, active: false, highestBidHuman: priceHuman ?? s.highestBidHuman }));
    },
    onAuctionCancelled: (ev) => {
      if (!ev?.auctionId || String(ev.auctionId) !== String(auctionIdDb ?? "")) return;
      setAuctionIdOnChain(null); // hide manage controls immediately
      setAuctionSnap((s) => ({ ...s, active: false }));
    },
  });

  /* --------------------------------
   * Countdown (also drives "not started yet" guard)
   * -------------------------------- */
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const startDeltaMs =
    auctionSnap.startISO && Number.isFinite(new Date(auctionSnap.startISO).getTime())
      ? new Date(auctionSnap.startISO).getTime() - now
      : 0;
  const endDeltaMs =
    auctionSnap.endISO && Number.isFinite(new Date(auctionSnap.endISO).getTime())
      ? new Date(auctionSnap.endISO).getTime() - now
      : 0;

  const { d: sd, h: sh, m: sm, s: ss } = msParts(startDeltaMs);
  const { d, h, m, s } = msParts(endDeltaMs);

  const notStartedYet = !!auctionSnap.startISO && startDeltaMs > 0;

  /**
   * IMPORTANT:
   * - UI is gated by `booted`, so we never show "Ended" before data exists.
   * - Treat inactive as ended (covers cancel/settle).
   */
  const auctionEnded = booted
    ? !auctionSnap.active || (auctionSnap.endISO ? endDeltaMs <= 0 : false)
    : false;

  /* --------------------------------
   * Bid form (with "Max" chip and validation)
   * -------------------------------- */
  const [bidInput, setBidInput] = useState("");
  const minRequiredHuman = useMemo(() => {
    const start = parseFloat(auctionSnap.startPriceHuman ?? "0") || 0;
    const inc = parseFloat(auctionSnap.minIncrementHuman ?? "0") || 0;
    const highest = parseFloat(auctionSnap.highestBidHuman ?? "0") || 0;
    return highest > 0 ? highest + inc : start;
  }, [auctionSnap.startPriceHuman, auctionSnap.minIncrementHuman, auctionSnap.highestBidHuman]);

  const isSeller = !!(auctionSnap.seller && account?.address) && eqCI(auctionSnap.seller, account.address);

  const minValid = (() => {
    const n = parseFloat(bidInput || "0");
    if (!Number.isFinite(n) || n <= 0) return false;
    return n >= (minRequiredHuman || 0);
  })();

  function sanitizeHuman(x: string): string {
    const t = (x || "").trim();
    if (!t) return "";
    if (!/^\d*\.?\d*$/.test(t)) return t.replace(/[^\d.]/g, "");
    return t;
  }

  function fillMax() {
    if (!minRequiredHuman) return;
    const decimals = auctionSnap.currencyDecimals || 18;
    const out = Number(minRequiredHuman).toFixed(Math.min(6, decimals));
    setBidInput(out.replace(/\.?0+$/, ""));
  }

  async function placeBid() {
    try {
      if (!account?.address) return toast.info("Connect your wallet to place a bid.");
      if (!auctionIdOnChain) return toast.error("No active auction found.");
      if (!auctionIdDb) return toast.error("Auction reference not ready. Try again.");
      if (auctionEnded) return toast.error("Auction has ended.");
      if (notStartedYet) return toast.error("Bidding hasn’t opened yet.");
      if (isSeller) return toast.error("Sellers can’t bid on their own auction.");

      const amount = parseFloat((bidInput || "").trim());
      if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter a valid bid amount.");
      if (amount < minRequiredHuman)
        return toast.error(`Bid must be at least ${minRequiredHuman} ${auctionSnap.currencySymbol}.`);

      const expectedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 52014);
      const { signer, chainId } = await getBrowserSigner();
      if (Number(chainId) !== expectedChainId) return toast.error("Wrong network. Please switch to Electroneum.");

      const mktAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
      const contractMkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);
      const wei = ethers.parseUnits(String(amount), auctionSnap.currencyDecimals);

      loader.show("Submitting your bid on-chain…");

      let tx;
      if (auctionSnap.currencyAddress && auctionSnap.currencyAddress !== ZERO_ADDRESS) {
        const erc20 = new ethers.Contract(
          auctionSnap.currencyAddress as `0x${string}`,
          [
            "function allowance(address owner, address spender) view returns (uint256)",
            "function approve(address spender, uint256 value) returns (bool)",
          ],
          signer
        );
        const ownerAddr = await signer.getAddress();
        const allowance: bigint = await erc20.allowance(ownerAddr, mktAddr);
        if (allowance < wei) {
          loader.show("Approving token spend…");
          const txA = await erc20.approve(mktAddr, wei);
          await txA.wait();
        }
        loader.show("Placing bid…");
        tx = await contractMkt.bid(BigInt(auctionIdOnChain), wei);
      } else {
        loader.show("Placing bid…");
        tx = await contractMkt.bid(BigInt(auctionIdOnChain), wei, { value: wei });
      }

      try {
        await fetch("/api/pending-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "NFT_AUCTION_BID",
            txHash: tx.hash,
            from: account.address,
            chainId: Number(chainId),
            payload: {
              auctionId: auctionIdDb,
              bidAmountBaseUnits: wei.toString(),
              currencyId: currencyIdDb ?? null,
            },
            relatedId: auctionIdDb,
          }),
        });
      } catch {
      } finally {
        loader.hide();
      }

      toast.success("Bid submitted! Waiting to confirm…");
      setBidInput("");
    } catch (e: any) {
      loader.hide();
      toast.error(e?.reason || e?.message || "Bid failed");
    }
  }

  /* --------------------------------
   * Cancel auction (seller-only)
   * -------------------------------- */
  const marketplaceAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS || "";
  const isEscrowOwner = eqCI(nft?.ownerWallet, marketplaceAddr);
  const canManageAuction = !!(auctionSnap.seller && account?.address) && eqCI(auctionSnap.seller, account.address);
  const canCancelAuction = useMemo(() => canManageAuction && confirmedBids.length === 0, [canManageAuction, confirmedBids.length]);

  async function cancelAuction() {
    try {
      if (!auctionIdOnChain) return;
      if (!canCancelAuction) return toast.error("You can only cancel before any bids.");
      const expectedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 52014);
      const { signer, chainId } = await getBrowserSigner();
      if (Number(chainId) !== expectedChainId) return toast.error("Wrong network. Please switch to Electroneum.");
      const mktAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
      const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);

      loader.show("Cancelling auction…");
      const tx = await mkt.cancelAuction(BigInt(auctionIdOnChain));
      const receipt = await tx.wait();
      loader.hide();

      // 1) Immediate local UI
      setAuctionIdOnChain(null); // hide manage controls
      setAuctionSnap((s) => ({ ...s, active: false })); // stops timer & disables inputs
      toast.success("Auction cancelled");

      // 2) Persist to DB
      try {
        await fetch("/api/marketplace/auctions/attach-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "CANCELLED",
            auctionId: auctionIdDb,
            txHash: tx.hash || receipt?.transactionHash || null,
          }),
        });
      } catch {
        // Non-fatal; indexers/SSE will reconcile.
      }
    } catch (e: any) {
      loader.hide();
      toast.error(e?.message || "Cancel failed");
    }
  }

  /* --------------------------------
   * Share & refresh
   * -------------------------------- */
  const shareTitle = nft?.name || (nft?.tokenId ? `NFT #${nft.tokenId}` : `Auction #${auctionIdParam?.slice(0, 6)}…`);
  const shareText =
    (nft?.description && nft.description.slice(0, 120)) || `Join the live auction for ${shareTitle} on Panthart`;
  const shareImage = nft?.image ?? "";

  async function refreshSnapshot() {
    try {
      if (!contract || !tokenId || !nft?.standard) return;
      loader.show("Refreshing auction…");

      const au =
        nft?.standard === "ERC1155" && apiAuctionSeller
          ? await marketplace.readActiveAuctionForSeller({
              collection: contract as `0x${string}`,
              tokenId: BigInt(tokenId),
              standard: (nft?.standard ?? "ERC721") as Standard,
              seller: apiAuctionSeller as `0x${string}`,
            })
          : await marketplace.readActiveAuction({
              collection: contract as `0x${string}`,
              tokenId: BigInt(tokenId),
              standard: (nft?.standard ?? "ERC721") as Standard,
            });

      if (!au) {
        setAuctionIdOnChain(null);
        loader.hide();
        return;
      }

      setAuctionIdOnChain(String(au.id));
      const decimals = auctionSnap.currencyDecimals;
      setAuctionSnap((s) => ({
        ...s,
        highestBidHuman:
          au.row.highestBid && au.row.highestBid > 0n
            ? String(Number(au.row.highestBid) / 10 ** decimals)
            : s.highestBidHuman,
        bidsCount: Number(au.row.bidsCount || s.bidsCount),
        seller: s.seller ?? apiAuctionSeller ?? String(au.row.seller ?? ""),
        highestBidder: au.row.highestBidder ? String(au.row.highestBidder) : s.highestBidder ?? null,
      }));
      await fetchRecentBids();
      loader.hide();
      toast.success("Auction refreshed");
    } catch {
      loader.hide();
      toast.error("Could not refresh auction");
    }
  }

  /* --------------------------------
   * Render helpers
   * -------------------------------- */
  const highestBidderMeta = (() => {
    const w = auctionSnap.highestBidder || "";
    if (!w) return null;
    return bidderCache.current.get(keyOf(w)) ?? { wallet: w, username: null, avatarUrl: dicebear(w) };
  })();

  const brandNameClass = "text-brand dark:text-brand";

  const is1155 = nft?.standard === "ERC1155";
  const editionQty = Math.max(1, Number(nft?.quantity ?? 1));

  /* ---------- SKELETON GATE ---------- */
  if (!booted) return <AuctionSkeleton />;

  /* --------------------------------
   * Render
   * -------------------------------- */
  const kind = mediaKind(nft?.image);

  return (
    <section className="flex-1 py-6 sm:py-8">
      {/* Breadcrumb */}
      <div className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4 flex flex-wrap items-center gap-1">
        <Link href="/" className="hover:underline">Home</Link>
        <span className="opacity-60">/</span>
        <Link href="/auction" className="hover:underline">Auctions</Link>
        <span className="opacity-60">/</span>
        <span className="font-mono truncate max-w-[40vw] sm:max-w-none" title={auctionIdParam}>
          {auctionIdParam?.slice(0, 6)}…{auctionIdParam?.slice(-4)}
        </span>
        {contract && tokenId && (
          <>
            <span className="opacity-60">/</span>
            <Link href={`/collections/${contract}/1`} className="hover:underline font-mono">
              {contract.slice(0, 6)}…{contract.slice(-4)}
            </Link>
            <span className="opacity-60">/</span>
            <span className="font-medium">{tokenId}</span>
          </>
        )}
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        {/* Media */}
        <div className="lg:col-span-5 min-w-0">
          <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-muted shadow-sm flex items-center justify-center">
            {nft?.image && !imgError ? (
              kind === "video" ? (
                <video src={nft.image as string} className="w-full h-full object-contain" playsInline controls loop muted />
              ) : (
                <Image
                  src={nft.image}
                  alt={nft?.name || (tokenId ? `NFT #${tokenId}` : "NFT")}
                  fill
                  priority
                  unoptimized
                  onError={() => setImgError(true)}
                  className="object-contain object-center"
                />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Skeleton className="w-24 h-24 rounded-md" />
              </div>
            )}
          </div>

          {/* Under-image details */}
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs sm:text-sm">
            <InfoRow label="Standard" value={(nft?.standard ?? "ERC721").toString()} />
            {is1155 && (
              <InfoRow
                label={editionQty > 1 ? "Copies" : "Edition"}
                value={String(editionQty)}
              />
            )}
            {typeof nft?.royaltyBps === "number" && (
              <InfoRow label="Royalties" value={`${(nft.royaltyBps / 100).toFixed(2)}%`} />
            )}
            {contract && (
              <div className="col-span-2 flex items-center gap-2 text-xs sm:text-sm min-w-0">
                <span className="text-muted-foreground">Contract:</span>
                <span className="font-mono text-[11px] sm:text-xs truncate" title={contract}>{contract}</span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(contract);
                    toast.success("Contract copied");
                  }}
                  title="Copy contract address"
                  className="opacity-70 hover:opacity-100"
                >
                  <Copy size={14} />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="lg:col-span-7 flex flex-col gap-5 sm:gap-6 min-w-0">
          {/* Title & actions */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold leading-tight break-words">
                {nft?.name || (tokenId ? `NFT #${tokenId}` : `Auction #${auctionIdParam?.slice(0, 6)}…`)}
              </h1>

              {/* Edition chip for ERC1155 when quantity > 1 */}
              {is1155 && editionQty > 1 && (
                <div className="mt-1">
                  <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] sm:text-xs text-muted-foreground">
                    Edition of {editionQty}
                  </span>
                </div>
              )}

              {nft?.description && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                  {nft.description}
                </p>
              )}

              {/* Owner/Seller */}
              <div className="mt-3 text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <span>Owner</span>
                  {isEscrowOwner && (
                    <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-500/15 text-amber-700 px-2 py-[2px] text-[10px]">
                      <BadgeCheck size={12} /> Escrow
                    </span>
                  )}
                  <span className="font-mono text-[11px]">
                    {(nft?.ownerWallet && `${nft.ownerWallet.slice(0, 6)}…${nft.ownerWallet.slice(-4)}`) || "—"}
                  </span>
                </div>
                {(auctionSnap.seller || apiAuctionSeller) && (
                  <div className="flex items-center gap-2">
                    <span>Seller</span>
                    <span className="font-mono text-[11px]">
                      {`${(auctionSnap.seller ?? apiAuctionSeller)!.slice(0, 6)}…${(auctionSnap.seller ?? apiAuctionSeller)!.slice(-4)}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => {
                  if (navigator.share && shareImage) {
                    navigator
                      .share({
                        title: shareTitle,
                        text: shareText,
                        url: typeof window !== "undefined" ? window.location.href : "",
                      })
                      .catch(() => {});
                  } else {
                    navigator.clipboard.writeText(typeof window !== "undefined" ? window.location.href : "");
                    toast.success("Link copied");
                  }
                }}
                title="Share"
              >
                <Share2 size={18} className="mr-2" /> Share
              </Button>
              <Button variant="outline" onClick={refreshSnapshot} title="Refresh">
                <RefreshCw size={18} className="mr-2" /> Refresh
              </Button>
            </div>
          </div>

          {/* Price / timer card */}
          <div className="border rounded-2xl p-4 sm:p-5 shadow-sm bg-background/60 backdrop-blur min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              <div className="min-w-0">
                <small className="text-muted-foreground">Current Highest Bid</small>
                <div className="text-xl sm:text-2xl font-semibold mt-1 break-words">
                  {auctionSnap.highestBidHuman
                    ? `${auctionSnap.highestBidHuman} ${auctionSnap.currencySymbol}`
                    : auctionSnap.startPriceHuman
                    ? `${auctionSnap.startPriceHuman} ${auctionSnap.currencySymbol}`
                    : "—"}
                </div>

                {/* Highest bidder face/name */}
                {auctionSnap.highestBidder && (
                  <div className="mt-2 flex items-center gap-2 min-w-0">
                    <Image
                      src={highestBidderMeta?.avatarUrl || dicebear(auctionSnap.highestBidder)}
                      alt="bidder"
                      width={18}
                      height={18}
                      className="rounded-full"
                    />
                    <Link
                      href={`/profile/${auctionSnap.highestBidder}`}
                      className={`truncate font-medium ${brandNameClass}`}
                      title={auctionSnap.highestBidder}
                    >
                      {highestBidderMeta?.username && highestBidderMeta.username.trim().length > 0
                        ? highestBidderMeta.username
                        : `${auctionSnap.highestBidder.slice(0, 6)}…${auctionSnap.highestBidder.slice(-4)}`}
                    </Link>
                  </div>
                )}
              </div>

              <Stat
                label="Min Increment"
                value={
                  auctionSnap.minIncrementHuman
                    ? `${auctionSnap.minIncrementHuman} ${auctionSnap.currencySymbol}`
                    : "—"
                }
              />

              <div className="min-w-0">
                <small className="text-muted-foreground inline-flex items-center gap-1">
                  <Clock size={14} /> {notStartedYet ? "Starts In" : "Ends In"}
                </small>
                <div className="text-xl font-semibold mt-1">
                  {auctionSnap.startISO || auctionSnap.endISO ? (
                    auctionEnded ? (
                      <span className="text-red-600">Auction Ended</span>
                    ) : notStartedYet ? (
                      <>
                        {sd > 0 && `${sd}d `} {sh}h {sm}m {ss}s
                      </>
                    ) : (
                      <>
                        {d > 0 && `${d}d `} {h}h {m}m {s}s
                      </>
                    )
                  ) : (
                    "—"
                  )}
                </div>

                {/* Wrap-friendly Start/End */}
                <div className="mt-2 text-xs text-muted-foreground grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 leading-relaxed">
                  {auctionSnap.startISO && (
                    <span className="break-words">Start: {new Date(auctionSnap.startISO).toLocaleString()}</span>
                  )}
                  {auctionSnap.endISO && (
                    <span className="break-words">End: {new Date(auctionSnap.endISO).toLocaleString()}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Bid form */}
            <div className="mt-5 sm:mt-6 border rounded-xl p-3 sm:p-4">
              {/* Seller cannot bid notice */}
              {isSeller && (
                <div className="mb-3 sm:mb-4 rounded-lg border bg-muted/40 text-muted-foreground text-xs p-3">
                  Sellers cannot place bids on their own items.
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="relative w-full sm:flex-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    placeholder={`Your bid in ${auctionSnap.currencySymbol}`}
                    className="w-full px-3 py-2 border rounded-md bg-background pr-16"
                    value={bidInput}
                    onChange={(e) => setBidInput(sanitizeHuman(e.target.value))}
                    disabled={!auctionSnap.active || auctionEnded || notStartedYet || isSeller}
                  />
                  {/* MAX chip */}
                  <button
                    type="button"
                    onClick={fillMax}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md border text-xs"
                    title="Set to minimum required bid"
                    disabled={!auctionSnap.active || auctionEnded || notStartedYet || isSeller}
                  >
                    Max
                  </button>
                </div>

                <Button
                  className="whitespace-nowrap"
                  onClick={placeBid}
                  disabled={!auctionSnap.active || auctionEnded || notStartedYet || isSeller || !minValid}
                  title={
                    !auctionSnap.active || auctionEnded
                      ? "Auction is not active"
                      : notStartedYet
                      ? "Bidding opens at the start time"
                      : isSeller
                      ? "Sellers cannot bid"
                      : minValid
                      ? "Place your bid"
                      : "Enter at least the minimum required"
                  }
                >
                  Place Bid
                </Button>
              </div>

              <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                <span>Minimum required:</span>
                <span className="font-semibold">
                  {minRequiredHuman} {auctionSnap.currencySymbol}
                </span>
                {!minValid && bidInput && <span className="text-red-500">Enter your bid.</span>}
              </div>

              {/* Seller-only cancel */}
              {auctionIdOnChain && canManageAuction && (
                <div className="mt-4">
                  <Button
                    variant="outline"
                    onClick={cancelAuction}
                    disabled={!canCancelAuction}
                    title={canCancelAuction ? "Cancel Auction" : "Cannot cancel after first bid"}
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Cancel Auction
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Recent bids */}
          <div className="border rounded-2xl p-4 sm:p-5 shadow-sm bg-background/60 min-w-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-semibold">Live Bids</h3>
              <span className="text-xs text-muted-foreground">
                {mergedBids.length} shown · {auctionSnap.bidsCount} total
              </span>
            </div>

            {mergedBids.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-3">No bids yet. Be the first to bid!</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {mergedBids.map((b) => {
                  const key =
                    (b as any).txHash && typeof (b as any).txHash === "string"
                      ? (b as any).txHash
                      : `${keyOf((b as any).bidder)}-${b.time}`;
                  const isPending = (b as any).pending === true;
                  const wallet = (b as any).bidder as string;
                  const meta =
                    bidderCache.current.get(keyOf(wallet)) ?? { wallet, username: null, avatarUrl: dicebear(wallet) };

                  return (
                    <li key={key} className="flex items-center justify-between gap-3 text-sm rounded-lg border px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Image
                          src={meta.avatarUrl || dicebear(wallet)}
                          alt="bidder"
                          width={18}
                          height={18}
                          className="rounded-full"
                        />
                        <Link href={`/profile/${wallet}`} className={`truncate ${brandNameClass}`} title={wallet}>
                          {meta.username && meta.username.trim().length > 0
                            ? meta.username
                            : `${wallet.slice(0, 6)}…${wallet.slice(-4)}`}
                        </Link>
                      </div>

                      <span className="font-medium shrink-0">
                        {b.amountHuman} {auctionSnap.currencySymbol}
                        {isPending && <span className="ml-2 text-xs text-amber-600">Pending…</span>}
                      </span>

                      <span className="text-muted-foreground text-xs shrink-0">
                        {new Date(b.time).toLocaleTimeString()}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- helpers ----------------------------- */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <small className="text-muted-foreground">{label}</small>
      <div className="text-xl font-semibold mt-1 break-words">{value}</div>
    </div>
  );
}
