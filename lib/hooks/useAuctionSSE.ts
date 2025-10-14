// lib/hooks/useAuctionSSE.ts
"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * Unified SSE hook with watchdog
 * - Subscribes to BOTH:
 *    • Auction room:   /api/stream/auction/:auctionId
 *    • Wallet room:    /api/stream/wallet/:address  (optional)
 * - Named events: bid_* , auction_* , ping, ready
 * - Auto-reconnect if no 'ping' or 'ready' within watchdog window
 */

type BidBase = {
  txHash: string;
  from: string;
  auctionId: string;
  amount: string; // base units string
  currencyId: string | null;
  at: number;
  blockNumber?: number;
};

type SSEHandlers = {
  onReady?: () => void;

  onBidPending?: (ev: BidBase) => void;
  onBidConfirmed?: (ev: BidBase) => void;
  onBidFailed?: (ev: { txHash: string; from: string; auctionId: string; reason?: string; at: number }) => void;

  onAuctionExtended?: (ev: { auctionId: string; newEndTimeSec: number }) => void;

  onAuctionSettled?: (ev: {
    auctionId: string;
    status?: "ENDED";
    winner?: string | null;
    price?: string | null;
    amount?: string | null;
    blockNumber?: number;
    txHash?: string;
    at: number;
  }) => void;

  onAuctionCancelled?: (ev: {
    auctionId: string;
    status?: "CANCELLED";
    blockNumber?: number;
    txHash?: string;
    at: number;
  }) => void;
};

type Options = {
  auctionSubscribeUrlBuilder?: (auctionId: string) => string;
  walletSubscribeUrlBuilder?: (wallet: string) => string;
};

function safeJSON<T = any>(s: string): T | undefined {
  try { return JSON.parse(s) as T; } catch { return undefined; }
}

function makeManagedES(
  url: string,
  onMessage: (es: EventSource) => void,
  onOpen?: () => void,
  onSilentTimeout?: () => void
) {
  const es = new EventSource(url, { withCredentials: false });

  const pingWindowMs = 35000; // if we don't see ready/ping within 35s, recycle
  let lastSeen = Date.now();

  const bump = () => { lastSeen = Date.now(); };

  const t = setInterval(() => {
    if (Date.now() - lastSeen > pingWindowMs) {
      clearInterval(t);
      try { es.close(); } catch {}
      onSilentTimeout?.();
    }
  }, 5000);

  es.addEventListener("ready", () => {
    bump();
    onOpen?.();
  });
  es.addEventListener("ping", () => bump());

  es.onerror = () => { /* browser will try default reconnect; watchdog will also recycle */ };

  // consumer wires handlers after create
  onMessage(es);

  return {
    close() {
      clearInterval(t);
      try { es.close(); } catch {}
    }
  };
}

export function useAuctionSSE(
  auctionId?: string | number | bigint,
  wallet?: string,
  handlers?: SSEHandlers,
  opts?: Options
) {
  const stableHandlers = useRef(handlers);
  stableHandlers.current = handlers;

  const auctionUrl = useMemo(() => {
    if (auctionId == null) return null;
    const id = String(auctionId);
    if (opts?.auctionSubscribeUrlBuilder) return opts.auctionSubscribeUrlBuilder(id);
    return `/api/stream/auction/${encodeURIComponent(id)}`;
  }, [auctionId, opts?.auctionSubscribeUrlBuilder]);

  const walletUrl = useMemo(() => {
    if (!wallet) return null;
    if (opts?.walletSubscribeUrlBuilder) return opts.walletSubscribeUrlBuilder(wallet);
    return `/api/stream/wallet/${encodeURIComponent(wallet)}`;
  }, [wallet, opts?.walletSubscribeUrlBuilder]);

  // Simple backoff
  const backoffRef = useRef(1000);

  // --- Auction room ---
  useEffect(() => {
    if (!auctionUrl) return;
    let stopped = false;
    let current: { close: () => void } | null = null;

    const wire = () => {
      if (stopped) return;

      current = makeManagedES(
        auctionUrl,
        (es) => {
          es.addEventListener("bid_pending", (e: MessageEvent) => {
            const data = safeJSON<BidBase>(e.data);
            if (data) stableHandlers.current?.onBidPending?.(data);
          });

          es.addEventListener("bid_confirmed", (e: MessageEvent) => {
            const data = safeJSON<BidBase>(e.data);
            if (data) stableHandlers.current?.onBidConfirmed?.(data);
          });

          es.addEventListener("bid_failed", (e: MessageEvent) => {
            const data = safeJSON<any>(e.data);
            if (data) stableHandlers.current?.onBidFailed?.(data);
          });

          es.addEventListener("auction_extended", (e: MessageEvent) => {
            const data = safeJSON<{ auctionId: string; newEndTimeSec: number }>(e.data);
            if (data) stableHandlers.current?.onAuctionExtended?.(data);
          });

          es.addEventListener("auction_settled", (e: MessageEvent) => {
            const raw = safeJSON<any>(e.data);
            if (!raw) return;
            const normalized = {
              auctionId: String(raw.auctionId),
              status: (raw.status || "ENDED") as "ENDED",
              winner: raw.winner ?? raw.highestBidder ?? null,
              price: raw.price ?? raw.amount ?? null,
              amount: raw.amount ?? raw.price ?? null,
              blockNumber: raw.blockNumber,
              txHash: raw.txHash,
              at: Number(raw.at || Date.now()),
            };
            stableHandlers.current?.onAuctionSettled?.(normalized);
          });

          es.addEventListener("auction_cancelled", (e: MessageEvent) => {
            const raw = safeJSON<any>(e.data);
            if (!raw) return;
            const normalized = {
              auctionId: String(raw.auctionId),
              status: (raw.status || "CANCELLED") as "CANCELLED",
              blockNumber: raw.blockNumber,
              txHash: raw.txHash,
              at: Number(raw.at || Date.now()),
            };
            stableHandlers.current?.onAuctionCancelled?.(normalized);
          });
        },
        () => stableHandlers.current?.onReady?.(),
        () => {
          // silent timeout -> reconnect with backoff
          if (stopped) return;
          const wait = backoffRef.current;
          backoffRef.current = Math.min(wait * 2, 8000);
          setTimeout(wire, wait + Math.floor(Math.random() * 400));
        }
      );
    };

    // first connect
    backoffRef.current = 1000;
    wire();

    return () => {
      stopped = true;
      current?.close();
    };
  }, [auctionUrl]);

  // --- Wallet room (optional) ---
  useEffect(() => {
    if (!walletUrl) return;
    let stopped = false;
    let current: { close: () => void } | null = null;

    const wire = () => {
      if (stopped) return;

      current = makeManagedES(
        walletUrl,
        (es) => {
          es.addEventListener("bid_pending", (e: MessageEvent) => {
            const data = safeJSON<BidBase>(e.data);
            if (data) stableHandlers.current?.onBidPending?.(data);
          });

          es.addEventListener("bid_confirmed", (e: MessageEvent) => {
            const data = safeJSON<BidBase>(e.data);
            if (data) stableHandlers.current?.onBidConfirmed?.(data);
          });

          es.addEventListener("bid_failed", (e: MessageEvent) => {
            const data = safeJSON<any>(e.data);
            if (data) stableHandlers.current?.onBidFailed?.(data);
          });
        },
        undefined,
        () => {
          if (stopped) return;
          const wait = backoffRef.current;
          backoffRef.current = Math.min(wait * 2, 8000);
          setTimeout(wire, wait + Math.floor(Math.random() * 400));
        }
      );
    };

    backoffRef.current = 1000;
    wire();

    return () => {
      stopped = true;
      current?.close();
    };
  }, [walletUrl]);
}
