// app/api/governance/stolen/reports/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { createPublicClient, http } from "viem";
import { STOLEN_REGISTRY_ABI } from "@/lib/abis/marketplace-core/stolenRegistryABI";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
const REGISTRY = process.env.NEXT_PUBLIC_STOLEN_REGISTRY_ADDRESS as `0x${string}` | undefined;

export async function GET() {
  try {
    await prismaReady;

    // latest 200 user reports still marked FLAGGED (off-chain)
    const items = await prisma.stolenItem.findMany({
      where: { source: "USER", status: "FLAGGED" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        contract: true,
        tokenId: true,
        reporterAddress: true,
        reporterUserId: true,
        evidenceUrl: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // optionally enrich with on-chain "active" check
    let onChainMap: Record<string, boolean> = {};
    if (RPC_URL && REGISTRY) {
      const client = createPublicClient({ transport: http(RPC_URL) });
      // do sequential to keep it simple & reliable on any RPC
      for (const it of items) {
        try {
          const rep = (await client.readContract({
            address: REGISTRY,
            abi: STOLEN_REGISTRY_ABI as any,
            functionName: "getReport",
            args: [it.contract as `0x${string}`, BigInt(it.tokenId)],
          })) as any;
          // tuple: { active: boolean } is last field
          const active = !!rep?.active;
          onChainMap[it.id] = active;
        } catch {
          onChainMap[it.id] = false;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: items.map((it) => ({
        ...it,
        onChainActive: onChainMap[it.id] ?? false,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
