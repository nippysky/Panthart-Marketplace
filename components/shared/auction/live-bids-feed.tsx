"use client";

import React, { useEffect, useMemo, useState } from "react";

type BidRow = {
  txHash?: string;
  bidder: string;
  amountHuman: string;
  time: number; // ms
};

export default function LiveBidsFeed({
  rows,
}: {
  rows: BidRow[];
}) {
  const [items, setItems] = useState<BidRow[]>(rows || []);

  useEffect(() => {
    setItems(rows || []);
  }, [rows]);

  const hasItems = items.length > 0;

  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm font-medium mb-2">Live Bids</div>
      {!hasItems ? (
        <p className="text-sm text-muted-foreground">No bids yet. Be the first!</p>
      ) : (
        <ul className="space-y-2">
          {items.map((b, idx) => (
            <li key={b.txHash ?? idx} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{b.amountHuman}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(b.time).toLocaleString()} • {b.bidder.slice(0, 6)}…{b.bidder.slice(-4)}
                </div>
              </div>
              {b.txHash ? (
                <a
                  href={`https://blockexplorer.electroneum.com/tx/${b.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline opacity-70 hover:opacity-100"
                >
                  View Tx
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
