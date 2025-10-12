"use client";

/**
 * PricePanel — compact, modern, no duplicate "Current Price" block.
 *
 * Design goals
 * - Keep ALL existing logic unchanged.
 * - Remove unused space from the prior 2-column layout.
 * - Present info in a tight single-column card with clear hierarchy.
 * - Subtle badges + dot separators to reduce vertical churn.
 */

import { formatNumber } from "@/lib/utils";
import { CountdownChip } from "./CountdownChip";

/** Simple month formatting helper (unchanged) */
function formatHumanDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const months = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
  const m = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let hh = d.getHours();
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12 || 12;
  return `${m} ${day}, ${year}, ${hh}:${mm}${ampm}`;
}

const ETNIcon = () => (
  <span className="inline-block w-3.5 h-3.5 bg-emerald-500 rounded-full" title="ETN" />
);

type AuctionInfoForPanel =
  | null
  | {
      active: boolean;
      auction?:
        | null
        | {
            highestBid?: number | string | null;
            startPrice?: number | string | null;
            endTime?: string | null;

            // Optional rich fields (safe to ignore here)
            currency?: { symbol?: string | null; decimals?: number | null } | null;
            amounts?:
              | null
              | {
                  startPrice?: string | number | null;
                  highestBid?: string | number | null;
                  minIncrement?: string | number | null;
                  startPriceWei?: string | number | null;
                  highestBidWei?: string | number | null;
                  minIncrementWei?: string | number | null;
                };
          };
    };

export function PricePanel({
  isListedLive,
  priceHuman,
  currencyLabel,
  listedQty,
  listingStartISO,
  listingEndISO,
  auctionInfo,
}: {
  isListedLive: boolean;
  priceHuman: string | null;
  currencyLabel: string;
  listedQty: number;
  listingStartISO: string | null;
  listingEndISO: string | null;
  auctionInfo: AuctionInfoForPanel;
}) {
  const now = Date.now();
  const notStartedYet = listingStartISO ? now < new Date(listingStartISO).getTime() : false;
  const endedAlready = listingEndISO ? now > new Date(listingEndISO).getTime() : false;
  const isForSaleUI = isListedLive && !endedAlready;

  // Normalize auction values to numbers for display (when possible)
  const highestBidVal =
    auctionInfo?.auction?.highestBid != null
      ? Number(auctionInfo.auction.highestBid)
      : undefined;
  const startPriceVal =
    auctionInfo?.auction?.startPrice != null
      ? Number(auctionInfo.auction.startPrice)
      : undefined;

  return (
    <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm p-4 md:p-5 lg:p-6">
      {/* Heading row */}
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-medium tracking-wide text-muted-foreground">
          Listing
        </div>

        {/* Inline state badge to avoid extra vertical space */}
        {isListedLive && (
          <div className="flex items-center gap-2 text-[11px]">
            {notStartedYet && (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-[2px] font-semibold text-amber-600">
                Starts soon
              </span>
            )}
            {endedAlready && (
              <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-[2px] font-semibold text-rose-600">
                Ended
              </span>
            )}
          </div>
        )}
      </div>

      {/* Price row */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!isForSaleUI ? (
          <span className="opacity-70 text-sm">Not for sale</span>
        ) : (
          <>
            <span className="text-3xl md:text-4xl font-semibold leading-none tracking-tight">
              {priceHuman != null ? formatNumber(Number(priceHuman)) : "—"}
            </span>
            <span className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600">
              {currencyLabel}
            </span>
            {listedQty > 1 && (
              <span className="text-xs text-muted-foreground">• Qty {listedQty}</span>
            )}
          </>
        )}
      </div>

      {/* Meta row — condensed to one line with dot separators */}
      {isListedLive && (
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="opacity-70">Start:</span>{" "}
          <b>{formatHumanDate(listingStartISO)}</b>
          <span className="mx-2 inline-block h-1 w-1 rounded-full bg-muted-foreground/50 align-middle" />
          <span className="opacity-70">End:</span>{" "}
          <b>{listingEndISO ? formatHumanDate(listingEndISO) : "No expiry"}</b>
        </div>
      )}

      {/* Divider between listing and auction (only when auction is present) */}
      {auctionInfo?.active && <div className="my-4 h-px w-full bg-border" />}

      {/* Auction block — tight, single row with countdown to the right */}
      {auctionInfo?.active && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium tracking-wide text-muted-foreground">
              Auction
            </span>
            <span className="inline-flex items-center gap-1 font-semibold">
              {Number.isFinite(highestBidVal)
                ? highestBidVal
                : Number.isFinite(startPriceVal)
                ? startPriceVal
                : "—"}{" "}
              <ETNIcon />
            </span>
          </div>

          <div className="shrink-0">
            <CountdownChip endISO={auctionInfo.auction?.endTime ?? null} />
          </div>
        </div>
      )}
    </div>
  );
}
