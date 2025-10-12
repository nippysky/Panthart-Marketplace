// app/api/profile/upsert-user/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


import { NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { isAddress, getAddress } from "viem";

export async function POST(req: Request) {
  await prismaReady;
  const raw = req.headers.get("x-user-address");
  if (!raw) return NextResponse.json({ error: "No address provided" }, { status: 400 });
  if (!isAddress(raw)) return NextResponse.json({ error: "Invalid address" }, { status: 400 });

  const checksum = getAddress(raw); // preserves original checksum casing

  // On citext columns, equality is case-insensitive automatically.
  const user = await prisma.user.upsert({
    where: { walletAddress: checksum },
    update: {},
    create: {
      walletAddress: checksum,
      username: `${checksum.slice(0, 6)}...${checksum.slice(-4)}`,
      profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${checksum}`,
      profileBanner:"https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png",
    },
  });

  return NextResponse.json({ ok: true, userId: user.id });
}
