export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { subscribe, walletTopic } from "@/lib/server/sse";

type Ctx = { params: Promise<{ address: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { address } = await ctx.params;
  const { stream } = subscribe(walletTopic(address));

  return new NextResponse(stream as any, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
