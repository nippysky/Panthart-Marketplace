// app/api/stolen/report/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

type Body = {
  contract: string;
  tokenId: string;
  reporterAddress: string; // required (wallet connected)
  evidenceUrl?: string | null;
  notes: string; // required
};

function norm(s: string) {
  return s?.trim();
}

export async function POST(req: NextRequest) {
  try {
    await prismaReady;
    const body = (await req.json()) as Partial<Body>;

    const contract = norm(body.contract || "");
    const tokenId = norm(body.tokenId || "");
    const reporterAddress = norm(body.reporterAddress || "");
    const evidenceUrl = norm(body.evidenceUrl || "");
    const notes = norm(body.notes || "");

    if (!contract || !tokenId || !reporterAddress || !notes) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields." },
        { status: 400 }
      );
    }

    // Upsert the StolenItem row
    const existing = await prisma.stolenItem.findUnique({
      where: { contract_tokenId: { contract, tokenId } },
    });

    let mergedNotes = notes;
    if (existing?.notes) {
      const stamp = new Date().toISOString();
      mergedNotes = `${existing.notes}\n\n---\n[New report @ ${stamp} from ${reporterAddress}]\n${notes}`;
    }

    const item = await prisma.stolenItem.upsert({
      where: { contract_tokenId: { contract, tokenId } },
      create: {
        contract,
        tokenId,
        status: "FLAGGED",
        source: "USER",
        reporterAddress,
        evidenceUrl: evidenceUrl || null,
        notes: mergedNotes,
        disputed: existing?.status === "CLEARED" ? true : false,
      },
      update: {
        // If admin had cleared it earlier, flag as disputed for review
        disputed: existing?.status === "CLEARED" ? true : existing?.disputed ?? false,
        reporterAddress, // last reporter
        evidenceUrl: evidenceUrl || existing?.evidenceUrl || null,
        notes: mergedNotes,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        contract: true,
        tokenId: true,
        status: true,
        source: true,
        reporterAddress: true,
        evidenceUrl: true,
        notes: true,
        disputed: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, data: item });
  } catch (err: any) {
    console.error("[stolen/report] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
