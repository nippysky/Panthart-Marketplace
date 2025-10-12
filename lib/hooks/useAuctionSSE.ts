"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * Unified SSE hook
 * - Subscribes to BOTH:
 *    • Auction room:   /api/stream/auction/:auctionId
 *    • Wallet room:    /api/stream/wallet/:address  (optional)
 * - Handles named events:
 *    • bid_pending, bid_confirmed, bid_failed, auction_extended
 *    • auction_settled, auction_cancelled
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

function mkES(url: string, onOpen?: () => void) {
  const es = new EventSource(url, { withCredentials: false });
  if (onOpen) es.addEventListener("ready", () => onOpen());
  es.onerror = () => { /* browser will auto-reconnect */ };
  return es;
}

function safeJSON<T = any>(s: string): T | undefined {
  try {
    return JSON.parse(s) as T;
  } catch {
    return undefined;
  }
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
    // keep original casing in the URL; server route should normalize if needed
    return `/api/stream/wallet/${encodeURIComponent(wallet)}`;
  }, [wallet, opts?.walletSubscribeUrlBuilder]);

  // --- Auction room ---
  useEffect(() => {
    if (!auctionUrl) return;

    const es = mkES(auctionUrl, () => stableHandlers.current?.onReady?.());

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

    return () => {
      try { es.close(); } catch {}
    };
  }, [auctionUrl]);

  // --- Wallet room (optional) ---
  useEffect(() => {
    if (!walletUrl) return;

    const es = mkES(walletUrl);

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

    return () => {
      try { es.close(); } catch {}
    };
  }, [walletUrl]);
}
