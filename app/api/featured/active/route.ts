// app/api/featured/active/route.ts
import { NextResponse } from "next/server";
import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import prisma, { prismaReady } from "@/lib/db";
import FeaturedAuctionAbi from "@/lib/abis/FeaturedAuction.json";

const RPC_HTTP = process.env.RPC_URL!;
const FEATURED_ADDR = process.env.NEXT_PUBLIC_FEATURED_AUCTION_ADDRESS!;

const provider = new JsonRpcProvider(RPC_HTTP);
const auction = new Contract(FEATURED_ADDR, FeaturedAuctionAbi as any, provider);

export async function GET() {
  await prismaReady;

  const active = await prisma.featuredCycle.findFirst({
    where: { status: "ACTIVE" },
    orderBy: [{ startAt: "desc" }],
    select: {
      id: true,
      cycleId: true,
      startAt: true,
      endAt: true,
      minBidWei: true,
      status: true,
    },
  });

  if (!active) {
    return NextResponse.json({ active: null });
  }

  // On-chain snapshot
  const oc = await auction.getCycle(active.cycleId);
  const leader = String(oc[3] ?? "0x0000000000000000000000000000000000000000");
  const leaderAmountWei = (oc[4] ? oc[4].toString() : "0");

  // Optional FX (TS-safe)
  const fxRow = await prisma.feeConfig.findFirst({
    where: { active: true, pricingPair: "ETNUSD", lastPriceUsd: { not: null } },
    orderBy: [{ lastPriceAt: "desc" }, { updatedAt: "desc" }],
    select: { lastPriceUsd: true, lastPriceAt: true },
  });

  const leaderUser = leader
    ? await prisma.user.findUnique({
        where: { walletAddress: leader },
        select: { id: true, username: true, profileAvatar: true, walletAddress: true },
      })
    : null;

  return NextResponse.json({
    active: {
      ...active,
      minBidETN: formatUnits(active.minBidWei.toString(), 18),
      leader,
      leaderAmountWei,
      leaderAmountETN: formatUnits(leaderAmountWei, 18),
      leaderUser,
    },
    fx: fxRow && fxRow.lastPriceUsd
      ? { lastPriceUsd: fxRow.lastPriceUsd.toString(), lastPriceAt: fxRow.lastPriceAt }
      : null,
    now: Date.now(),
    contract: FEATURED_ADDR,
  });
}
