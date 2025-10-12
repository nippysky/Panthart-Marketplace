// app/api/featured/has-bid/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { JsonRpcProvider, Contract } from "ethers";
import FeaturedAuctionAbi from "@/lib/abis/FeaturedAuction.json";

const RPC_HTTP = process.env.RPC_URL!;
const FEATURED_ADDR = process.env.NEXT_PUBLIC_FEATURED_AUCTION_ADDRESS!;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cycleId = (url.searchParams.get("cycleId") || "").trim();
  const addr = (url.searchParams.get("addr") || "").trim();

  if (!cycleId || !addr) {
    return NextResponse.json({ ok: false, error: "Missing cycleId or addr" }, { status: 200 });
  }

  try {
    const provider = new JsonRpcProvider(RPC_HTTP);
    const c = new Contract(FEATURED_ADDR, FeaturedAuctionAbi as any, provider);
    const b = await c.getBid(cycleId, addr);
    const totalWei = b?.[0]?.toString?.() ?? "0";
    const exists = Boolean(b?.[2]); // Bid.exists
    return NextResponse.json({ ok: true, exists, totalWei }, { status: 200 });
  } catch {
    // Soft-fail to "no bid" so the UI keeps working.
    return NextResponse.json({ ok: true, exists: false, totalWei: "0" }, { status: 200 });
  }
}
