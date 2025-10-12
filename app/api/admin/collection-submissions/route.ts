// app/api/admin/collection-submissions/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { SubmissionStatus } from "@/lib/generated/prisma";

function isAllowedWallet(addr: string | null | undefined) {
  if (!addr) return false;
  const allowed = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(addr.toLowerCase());
}

export async function GET(req: NextRequest) {
  await prismaReady;

  try {
    const adminWallet = req.headers.get("x-admin-wallet");
    if (!isAllowedWallet(adminWallet)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const statusParam = (searchParams.get("status") || "pending").toUpperCase();
    const statusMap: Record<string, SubmissionStatus> = {
      PENDING: SubmissionStatus.PENDING,
      APPROVED: SubmissionStatus.APPROVED,
      REJECTED: SubmissionStatus.REJECTED,
    };
    const status = statusMap[statusParam] ?? SubmissionStatus.PENDING;

    const rows = await prisma.collectionSubmission.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        logoUrl: true,
        coverUrl: true,
        name: true,
        contract: true,
        symbol: true,
        supply: true,
        ownerAddress: true,
        baseUri: true,
        description: true,
        website: true,
        x: true,
        instagram: true,
        telegram: true,
        createdAt: true,
        submittedByUserId: true,
        submittedBy: {
          select: {
            walletAddress: true,
            username: true,
            profileAvatar: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
