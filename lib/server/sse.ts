// lib/server/sse.ts
/* Simple SSE pub/sub for Next.js App Router (Node runtime).
   - Topics: "auction:<auctionId>", "wallet:<addressLower>"
   - publish(topic, event, payload) => fan-out to all connected clients for that topic
   - subscribe(topic) => ReadableStream for the route to return
*/

type Sink = {
  id: string;
  enqueue: (chunk: Uint8Array) => void;
  closed: boolean;
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

  for (const sink of sinks) {
    try {
      if (!sink.closed) sink.enqueue(bytes);
    } catch {
      // ignore broken pipe
    }
  }
}

export function subscribe(topic: string) {
  const id = crypto.randomUUID();
  let sink: Sink | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      sink = {
        id,
        closed: false,
        enqueue: (chunk) => controller.enqueue(chunk),
      };

      if (!topics.has(topic)) topics.set(topic, new Set());
      topics.get(topic)!.add(sink);

      // greet + instant retry-friendly headers
      controller.enqueue(enc.encode(`event: ready\ndata: {"ok":true}\n\n`));

      // keep-alive pings to prevent proxies from closing the stream
      const iv = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          // swallowed
        }
      }, 20000);

      // when the stream is canceled (client closed)
      (controller as any)._onCancel = () => {
        clearInterval(iv);
        if (sink) {
          sink.closed = true;
          topics.get(topic)?.delete(sink);
        }
      };
    },
    cancel() {
      if (sink) {
        sink.closed = true;
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
