"use client";

import React from "react";
import Link from "next/link";
import { Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  isOwnerConnected: boolean;

  // Listing shape
  listingSnap: {
    id: bigint;
    row: {
      seller: `0x${string}`;
      currency: `0x${string}`;
      price: bigint;
      quantity: bigint;
      start: bigint; // unix sec
      end: bigint;   // 0 => none
      standard: bigint;
    };
  } | null;
  listingPriceHuman: string | null;
  listingCurrencyLabel: string;

  // Auction (API-lite, normalized or legacy)
  auctionInfo: {
    active: boolean;
    auction?: {
      currency?: { symbol?: string | null; decimals?: number | null } | null;
      amounts?: {
        startPrice?: string | number | null;
        highestBid?: string | number | null;
        minIncrement?: string | number | null;
        startPriceWei?: string | number | null;
        highestBidWei?: string | number | null;
        minIncrementWei?: string | number | null;
      } | null;
      endTime?: string | null;

      highestBid?: number | string | null;
      startPrice?: number | string | null;
      highestBidEtn?: number | string | null;
      startPriceEtn?: number | string | null;
      highestBidEtnWei?: number | string | null;
      startPriceEtnWei?: number | string | null;
    } | null;

    highestBid?: number | string | null;
    startPrice?: number | string | null;
    highestBidEtn?: number | string | null;
    startPriceEtn?: number | string | null;
    highestBidEtnWei?: number | string | null;
    startPriceEtnWei?: number | string | null;
    endTime?: string | null;
  } | null;

  // Handlers
  onEditListing: () => void;
  onCancelListing: () => void;
  onCancelAuction: () => void;
  /** Optional: if provided, shows a “Finalize Auction” button when ended */
  onFinalizeAuction?: () => void;

  // Routing
  contract: string;
  tokenId: string;
};

function formatRange(startSec?: bigint | null, endSec?: bigint | null) {
  const s = startSec ? new Date(Number(startSec) * 1000) : null;
  const e = endSec && endSec !== 0n ? new Date(Number(endSec) * 1000) : null;
  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  if (s && e) return `${fmt(s)} → ${fmt(e)}`;
  if (s && !e) return `${fmt(s)} → No expiry`;
  return undefined;
}

/* -------------------- number helpers -------------------- */
function n(x: unknown): number | null {
  if (x == null) return null;
  const v = Number((x as any).toString?.() ?? x);
  return Number.isFinite(v) ? v : null;
}
function fromWei(x: unknown, decimals = 18): number | null {
  const v = n(x);
  return v == null ? null : v / 10 ** decimals;
}
function first<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) if (v != null) return v as T;
  return null;
}

/** Read auction numbers regardless of response shape (amounts.*, legacy, or top-level) */
function readAuctionNumbers(ai: Props["auctionInfo"]) {
  if (!ai) {
    return {
      highest: null as number | null,
      start: null as number | null,
      endTime: null as string | null,
      symbol: "ETN",
      decimals: 18,
    };
  }

  const a: any = ai.auction ?? {};
  const amounts: any = a.amounts ?? {};
  const symbol: string = a?.currency?.symbol ?? "ETN";
  const decimals: number = a?.currency?.decimals ?? 18;

  // Highest bid
  const highest =
    first<number>(
      n(amounts.highestBid),
      fromWei(amounts.highestBidWei, decimals),
      n(a.highestBid),
      n(a.highestBidEtn),
      fromWei(a.highestBidEtnWei, decimals),
      n((ai as any).highestBid),
      n((ai as any).highestBidEtn),
      fromWei((ai as any).highestBidEtnWei, decimals)
    );

  // Start price (fallback if no highest > 0)
  const start =
    first<number>(
      n(amounts.startPrice),
      fromWei(amounts.startPriceWei, decimals),
      n(a.startPrice),
      n(a.startPriceEtn),
      fromWei(a.startPriceEtnWei, decimals),
      n((ai as any).startPrice),
      n((ai as any).startPriceEtn),
      fromWei((ai as any).startPriceEtnWei, decimals)
    );

  const endTime: string | null = a?.endTime ?? (ai as any)?.endTime ?? null;

  return { highest, start, endTime, symbol, decimals };
}

export default function YourSaleBox(props: Props) {
  const {
    isOwnerConnected,
    listingSnap,
    listingPriceHuman,
    listingCurrencyLabel,
    auctionInfo,
    onEditListing,
    onCancelListing,
    onCancelAuction,
    onFinalizeAuction,
    contract,
    tokenId,
  } = props;

  const hasListing = !!listingSnap;
  const hasAuction = !!auctionInfo?.active;

  // Resolve the correct auction detail href (new route: /auction/:auctionId)
  const [auctionHref, setAuctionHref] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    async function resolveAuctionHref() {
      if (!hasAuction) {
        setAuctionHref(null);
        return;
      }
      try {
        const url = `/api/auction/active?contract=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(
          tokenId
        )}&limit=1`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("load fail");
        const j = await res.json();
        const id = j?.items?.[0]?.id;
        if (alive) {
          setAuctionHref(id ? `/auction/${id}` : "/auctions");
        }
      } catch {
        if (alive) setAuctionHref("/auctions");
      }
    }
    resolveAuctionHref();
    return () => {
      alive = false;
    };
    // Only re-run if identity changes or auction turns on/off
  }, [hasAuction, contract, tokenId]);

  if (!isOwnerConnected) return null;
  if (!hasListing && !hasAuction) return null;

  const { highest, start, endTime, symbol } = readAuctionNumbers(auctionInfo);
  const hasBid = highest != null && highest > 0;

  // Decide label & value without breaking your working logic
  const auctionLabel = hasBid ? "Highest Bid" : "Start Price";
  const auctionValue = hasBid ? highest : (start != null ? start : null);

  const ended =
    !!endTime && Number.isFinite(new Date(endTime).getTime())
      ? Date.now() > new Date(endTime).getTime()
      : false;

  return (
    <div className="rounded-xl border p-4 bg-card/40">
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-4 h-4 opacity-70" />
        <p className="text-sm font-medium">Your sale controls</p>
      </div>

      {/* Listing summary */}
      {hasListing && listingSnap && (
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-2">Listing</div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-sm">
              <div className="font-medium">
                {listingPriceHuman ?? "--"} {listingCurrencyLabel}
              </div>
              <div className="text-muted-foreground">
                Qty: {String(listingSnap.row.quantity)} •{" "}
                {formatRange(listingSnap.row.start, listingSnap.row.end) ?? "Now"}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onEditListing}>
                Edit Listing
              </Button>
              <Button variant="destructive" onClick={onCancelListing}>
                Cancel Listing
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Auction summary */}
      {hasAuction && (
        <div className="mt-2">
          <div className="text-xs text-muted-foreground mb-2">Auction</div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-sm">
              <div className="font-medium">
                <span className="text-muted-foreground mr-1">{auctionLabel}:</span>
                {auctionValue != null ? `${auctionValue} ${symbol}` : `-- ${symbol}`}
              </div>
              <div className="text-muted-foreground">
                Ends: {endTime ? new Date(endTime).toLocaleString() : "--"}
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={auctionHref || "/auctions"}
                className="inline-flex"
                prefetch={false}
                aria-disabled={!auctionHref}
              >
                <Button variant="secondary" disabled={!auctionHref}>
                  Open Auction
                </Button>
              </Link>

              {/* Hide cancel once there's any bid */}
              {!hasBid && (
                <Button variant="destructive" onClick={onCancelAuction}>
                  Cancel Auction
                </Button>
              )}

              {/* Anyone can finalize when ended; shown if parent provided handler */}
              {ended && onFinalizeAuction && (
                <Button onClick={onFinalizeAuction}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Finalize Auction
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        When a sale completes or you cancel/expire a listing, ownership is
        updated on-chain and mirrored in the database automatically, and the
        transaction hash is recorded.
      </p>
    </div>
  );
}
