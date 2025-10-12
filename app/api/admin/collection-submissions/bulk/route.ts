// app/api/admin/collection-submissions/bulk/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { SubmissionStatus } from "@/lib/generated/prisma";
import { notifyApproved, notifyRejected } from "@/lib/telegram";

/** Allow-list check using ADMIN_WALLETS (comma-separated) */
function isAllowedWallet(addr: string | null | undefined) {
  if (!addr) return false;
  const allowed = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(addr.toLowerCase());
}

/** Ensure a User row exists for a wallet (public placeholder profile) */
async function ensureUserPlaceholder(checksum: string) {
  return prisma.user.upsert({
    where: { walletAddress: checksum },
    update: {},
    create: {
      walletAddress: checksum,
      username: `${checksum.slice(0, 6)}...${checksum.slice(-4)}`,
      profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${checksum}`,
      profileBanner:
        "https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png",
    },
    select: { id: true },
  });
}

export async function POST(req: NextRequest) {
  await prismaReady;

  try {
    // 1) Auth via admin wallet header
    const adminWallet = req.headers.get("x-admin-wallet");
    if (!isAllowedWallet(adminWallet)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Parse body
    const body = (await req.json().catch(() => null)) as
      | { ids?: string[]; action?: "APPROVE" | "REJECT"; reason?: string }
      | null;

    if (!body?.ids?.length || !body?.action) {
      return NextResponse.json({ error: "Missing ids/action" }, { status: 400 });
    }

    // 3) Load items once (for Telegram messages)
    const items = await prisma.collectionSubmission.findMany({
      where: { id: { in: body.ids } },
      select: {
        id: true,
        name: true,
        symbol: true,
        contract: true,
        supply: true,
      },
    });

    if (items.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // 4) Map the admin wallet to a User (for reviewedByUserId)
    const adminUser = await ensureUserPlaceholder(adminWallet!);

    if (body.action === "APPROVE") {
      // IMPORTANT:
      // - Set status=APPROVED
      // - DO NOT set reviewedAt (reviewer script sets it after promotion)
      // - Fill reviewedByUserId for audit
      // - Clear any previous statusReason
      const updated = await prisma.collectionSubmission.updateMany({
        where: { id: { in: body.ids } },
        data: {
          status: SubmissionStatus.APPROVED,
          reviewedByUserId: adminUser.id,
          statusReason: null,
        },
      });

      await notifyApproved(items, { admin: adminWallet ?? undefined });
      return NextResponse.json({ success: true, count: updated.count });
    }

    // === REJECT ===
    // We delete rows to allow re-submission (your requested behavior).
    // Capture a short reason (also sent to Telegram).
    const reason =
      typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    await notifyRejected(items, {
      admin: adminWallet ?? undefined,
      reason: reason || undefined,
    });

    // Delete the submissions so creators can resubmit the same contract.
    const deleted = await prisma.collectionSubmission.deleteMany({
      where: { id: { in: body.ids } },
    });

    return NextResponse.json({ success: true, count: deleted.count });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}
