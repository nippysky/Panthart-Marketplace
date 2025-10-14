export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { subscribe, auctionTopic } from "@/lib/server/sse";

type Ctx = { params: Promise<{ auctionId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { auctionId } = await ctx.params;
  const { stream } = subscribe(auctionTopic(auctionId));

  return new NextResponse(stream as any, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
