// app/api/featured/activity/route.ts
import { addFeaturedListener } from "@/lib/sse";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  let closed = false;
  let cleanup: (() => void) | null = null;
  let hb: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Initial comment to establish SSE
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const send = (data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // If enqueue throws, the stream is closed. Mark closed and cleanup.
          close();
        }
      };

      cleanup = addFeaturedListener(send);

      // Heartbeat (safe enqueue)
      hb = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
        } catch {
          close();
        }
      }, 15000);

      function close() {
        if (closed) return;
        closed = true;
        try {
          if (hb) clearInterval(hb);
          hb = null;
          if (cleanup) cleanup();
          cleanup = null;
          controller.close();
        } catch {
          /* noop */
        }
      }

      // remember close on this instance
      (controller as any)._close = close;
    },
    cancel() {
      try {
        const c = (this as any)._controllerClose as undefined | (() => void);
        if (c) c();
      } catch {
        /* noop */
      }
    },
  });

  // Wire cancel->close (not all runtimes set it for us)
  (stream as any)._controllerClose = (stream as any).controller?._close;

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
