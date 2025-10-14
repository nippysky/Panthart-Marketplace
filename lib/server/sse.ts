// lib/server/sse.ts
/* Simple SSE pub/sub for Next.js App Router (Node runtime).
   - Topics: "auction:<auctionId>", "wallet:<addressLower>"
   - publish(topic, event, payload) => fan-out to all connected clients for that topic
   - subscribe(topic) => ReadableStream for the route to return
   - Robust: proper cleanup, keep-alive "ping" events, no leaks on disconnect.
*/

type Sink = {
  id: string;
  enqueue: (chunk: Uint8Array) => void;
  closed: boolean;
  stopHeartbeat: () => void;
};

type Topic = string;

declare global {
  // eslint-disable-next-line no-var
  var __SSE_TOPICS__: Map<Topic, Set<Sink>> | undefined;
}

const topics: Map<Topic, Set<Sink>> = global.__SSE_TOPICS__ ?? new Map();
global.__SSE_TOPICS__ = topics;

const enc = new TextEncoder();

export function publish(topic: string, event: string, data: unknown) {
  const sinks = topics.get(topic);
  if (!sinks || sinks.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const bytes = enc.encode(payload);

  for (const sink of Array.from(sinks)) {
    try {
      if (!sink.closed) sink.enqueue(bytes);
    } catch {
      // broken pipe — mark closed and prune
      try {
        sink.closed = true;
        sink.stopHeartbeat();
      } catch {}
      sinks.delete(sink);
    }
  }
}

export function subscribe(topic: string) {
  const id = crypto.randomUUID();
  let sink: Sink | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // register sink
      const heartbeatMs = 15000; // 15s: friendly to most proxies/CDNs
      const hb = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`event: ping\ndata: ${Date.now()}\n\n`));
        } catch {
          /* swallow; cancel() will clean up */
        }
      }, heartbeatMs);

      sink = {
        id,
        closed: false,
        enqueue: (chunk) => controller.enqueue(chunk),
        stopHeartbeat: () => clearInterval(hb),
      };

      if (!topics.has(topic)) topics.set(topic, new Set());
      topics.get(topic)!.add(sink);

      // immediate “ready” so client can confirm subscription and start its watchdog
      controller.enqueue(enc.encode(`event: ready\ndata: {"ok":true}\n\n`));
    },

    cancel() {
      if (sink) {
        sink.closed = true;
        try {
          sink.stopHeartbeat();
        } catch {}
        topics.get(topic)?.delete(sink);
      }
    },
  });

  return { stream, id };
}

// Topic helpers
export const auctionTopic = (auctionId: string | number | bigint) =>
  `auction:${String(auctionId)}`;

export const walletTopic = (addr: string) => `wallet:${addr.toLowerCase()}`;
