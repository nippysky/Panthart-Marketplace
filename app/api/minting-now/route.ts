// app/api/minting-now/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getMintingNowPage } from "@/lib/server/minting-now";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10)));
    const cursorISO = url.searchParams.get("cursorISO"); // may be null
    const page = await getMintingNowPage(limit, cursorISO);
    return NextResponse.json(page);
  } catch (e) {
    console.error("[/api/minting-now] failed:", e);
    return NextResponse.json({ items: [], nextCursor: null }, { status: 500 });
  }
}
