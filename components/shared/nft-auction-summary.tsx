"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Gavel } from "lucide-react";

export default function NftAuctionSummary({
  contract,
  tokenId,
}: {
  contract: string;
  tokenId: string;
}) {
  const [state, setState] = React.useState<null | {
    auctionId: string;
    startTime: string;
    endTime: string;
    symbol: string;
    current: string;
  }>(null);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // NEW: query the active-auctions endpoint filtered by this NFT identity
        const url = `/api/auction/active?contract=${encodeURIComponent(
          contract
        )}&tokenId=${encodeURIComponent(tokenId)}`;

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;

        const j = await res.json();

        // Find matching item (should be 0 or 1)
        const it =
          j?.items?.find?.(
            (x: any) =>
              x?.nft?.contract === contract &&
              String(x?.nft?.tokenId) === String(tokenId)
          ) ?? null;

        if (!mounted || !it) return;

        setState({
          auctionId: String(it.id),
          startTime: it.startTime,
          endTime: it.endTime,
          symbol: it?.currency?.symbol || "ETN",
          current:
            (typeof it?.price?.current === "string" &&
              it.price.current.trim().length > 0 &&
              it.price.current) ||
            "—",
        });
      } catch {
        // swallow
      }
    })();

    return () => {
      mounted = false;
    };
  }, [contract, tokenId]);

  if (!state) return null;

  return (
    <div className="rounded-xl border p-4 mt-4">
      <div className="text-sm text-muted-foreground">Auction</div>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <div className="text-xs">Start</div>
          <div className="font-medium">
            {new Date(state.startTime).toLocaleString()}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs">End</div>
          <div className="font-medium">
            {new Date(state.endTime).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs text-muted-foreground">Current</div>
        <div className="text-lg font-semibold">
          {state.current} {state.symbol}
        </div>
      </div>

      <div className="mt-4">
        {/* NEW: link to /auction/:auctionId */}
        <Link href={`/auction/${state.auctionId}`}>
          <Button className="w-full" variant="secondary">
            <Gavel className="w-4 h-4 mr-2" /> View Auction
          </Button>
        </Link>
      </div>
    </div>
  );
}
