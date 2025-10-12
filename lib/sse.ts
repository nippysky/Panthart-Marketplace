// lib/sse.ts

/**
 * Lightweight SSE hub + in-memory ring buffer for Featured bid events.
 * - addFeaturedListener(cb): subscribe to live events (server-side)
 * - pushFeaturedEvent(event): broadcast AND persist in buffer
 * - getFeaturedSnapshot(limit): last N events for hydration
 *
 * NOTE: The buffer lives in-memory on the server. It survives client reloads
 * but resets if the server restarts. If you want durability across restarts,
 * also store the same payloads in your DB and have the snapshot route read there.
 */

export type FeaturedLiveEvent = {
  kind: "BidPlaced" | "BidIncreased";
  at: number;
  txHash: string;
  cycleId: string;
  bidder: string;
  newTotalWei: string;
  collection: string;
  bidderProfile?: {
    username: string | null;
    profileAvatar: string | null;
    walletAddress: string;
  } | null;
  collectionMeta?: {
    name: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
    itemsCount: number | null;
    contract: string;
  } | null;
};

// Keep listener signature compatible with older callers that used `any`.
type Listener = (payload: FeaturedLiveEvent | any) => void;

const listeners = new Set<Listener>();

// In-memory ring buffer (head = newest)
const BUFFER_MAX = 50;
const buffer: FeaturedLiveEvent[] = [];

export function addFeaturedListener(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Broadcast a live event AND persist it into the ring buffer.
 * Call this right after you verify/store a successful bid tx.
 */
export function pushFeaturedEvent(payload: FeaturedLiveEvent | any) {
  try {
    // Store a shallow copy to avoid accidental external mutation
    const item = typeof payload === "object" ? { ...payload } : payload;
    buffer.unshift(item as FeaturedLiveEvent);
    if (buffer.length > BUFFER_MAX) buffer.pop();
  } catch {
    // ignore buffer errors
  }

  for (const fn of Array.from(listeners)) {
    try {
      fn(payload);
    } catch {
      // ignore listener errors
    }
  }
}

/**
 * Snapshot of the last N events (newest first).
 * Used by the client to hydrate the activity list on page load.
 */
export function getFeaturedSnapshot(limit = 30): FeaturedLiveEvent[] {
  return buffer.slice(0, Math.max(0, Math.min(limit, BUFFER_MAX)));
}
