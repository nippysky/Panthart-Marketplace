// app/api/user-info/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma";
import { isAddress, getAddress } from "viem";

export async function GET(req: NextRequest) {
  await prismaReady;

  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("address");
    if (!raw) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }
    if (!isAddress(raw)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    // Normalize to checksum (preserve user input for logs if needed)
    const checksum = getAddress(raw);

    // Explicit case-insensitive match (works even if column type ever changes)
    const user = await prisma.user.findFirst({
      where: { walletAddress: { equals: checksum, mode: Prisma.QueryMode.insensitive } },
      select: { profileAvatar: true, updatedAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const res = NextResponse.json({
      profileAvatar: user.profileAvatar,
      updatedAt: user.updatedAt.toISOString(),
    });
    // cache a little on the edge; user avatars don’t change every second
    res.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res;
  } catch (err) {
    console.error("[/api/user-info] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
