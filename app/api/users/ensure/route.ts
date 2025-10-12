// app/api/users/ensure/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { getAddress, isAddress } from "viem";

const DEFAULT_BANNER =
  "https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png";

type Body = { address?: string };

export async function POST(req: NextRequest) {
  await prismaReady;

  let addr = "";
  try {
    const body = (await req.json()) as Body;
    addr = (body.address || "").trim();
  } catch {
    // also allow query param fallback: /api/users/ensure?address=0x...
    const u = new URL(req.url);
    addr = (u.searchParams.get("address") || "").trim();
  }

  if (!addr || !isAddress(addr)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const checksum = getAddress(addr);

  // Try to find existing user by CITEXT unique walletAddress
  const existing = await prisma.user.findUnique({
    where: { walletAddress: checksum },
    select: { walletAddress: true, username: true, profileAvatar: true, profileBanner: true, updatedAt: true },
  });

  if (existing) {
    return NextResponse.json(existing, {
      headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" },
    });
  }

  // Create with placeholders (do NOT overwrite later)
  const created = await prisma.user.create({
    data: {
      walletAddress: checksum,
      username: `${checksum.slice(0, 6)}...${checksum.slice(-4)}`,
      profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${checksum}`,
      profileBanner: DEFAULT_BANNER,
    },
    select: { walletAddress: true, username: true, profileAvatar: true, profileBanner: true, updatedAt: true },
  });

  return NextResponse.json(created, { status: 201 });
}
