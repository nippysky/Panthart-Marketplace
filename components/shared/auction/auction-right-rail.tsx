"use client";

import React from "react";
import BidForm from "./bid-form";
import LiveBidsFeed from "./live-bids-feed";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;

  // header stats
  currencyLabel: string;              // "ETN" or "USDC", etc.
  highestBidLabel?: string | null;    // "25.5 ETN"
  startPriceLabel?: string | null;    // "10 ETN"
  endsAt?: string | null;             // ISO
  startsAt?: string | null;           // ISO (optional)
  minRequiredLabel?: string | null;   // "≥ 26.0 ETN" etc.

  // enablement
  canBid: boolean;
  auctionActive: boolean;

  // live feed rows
  bids: Array<{ bidder: string; amountHuman: string; time: number; txHash?: string }>;

  onPlaceBid: (amountHuman: string) => Promise<void>;
};

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

export default function AuctionRightRail({
  className,
  currencyLabel,
  highestBidLabel,
  startPriceLabel,
  endsAt,
  startsAt,
  minRequiredLabel,
  canBid,
  auctionActive,
  bids,
  onPlaceBid,
}: Props) {
  return (
    <aside className={cn("flex flex-col gap-4", className)}>
      <div className="rounded-xl border p-4">
        <div className="text-sm font-medium mb-3">Auction</div>
        <div className="grid grid-cols-2 gap-4">
          <Row label="Currency" value={currencyLabel} />
          <Row label="Highest Bid" value={highestBidLabel ?? startPriceLabel ?? "—"} />
          <Row
            label="Starts"
            value={startsAt ? new Date(startsAt).toLocaleString() : "—"}
          />
          <Row
            label="Ends"
            value={endsAt ? new Date(endsAt).toLocaleString() : "—"}
          />
        </div>
      </div>

      <BidForm
        currencyLabel={currencyLabel}
        minRequiredLabel={minRequiredLabel ?? undefined}
        disabled={!canBid || !auctionActive}
        onPlaceBid={onPlaceBid}
      />

      <LiveBidsFeed rows={bids} />
    </aside>
  );
}
