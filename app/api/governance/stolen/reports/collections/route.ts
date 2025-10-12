// app/api/governance/stolen/reports/collections/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { createPublicClient, http } from "viem";
import { STOLEN_REGISTRY_ABI } from "@/lib/abis/marketplace-core/stolenRegistryABI";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
const REGISTRY = process.env.NEXT_PUBLIC_STOLEN_REGISTRY_ADDRESS as `0x${string}` | undefined;

type GroupRow = {
  contract: string;
  _count: { _all: number };
  _max: { createdAt: Date | null };
};

type NewestRow = {
  contract: string;
  evidenceUrl: string | null;
  notes: string | null;
  createdAt: Date;
};

type MetaRow = {
  contract: string;
  name: string | null;
  symbol: string | null;
  logoUrl: string | null;
};

export async function GET() {
  try {
    await prismaReady;

    // Group by collection contract for USER reports that are still FLAGGED
    const groups = (await prisma.stolenItem.groupBy({
      by: ["contract"],
      where: { source: "USER", status: "FLAGGED" },
      _count: { _all: true },
      _max: { createdAt: true },
    })) as GroupRow[];

    if (groups.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const contracts: string[] = groups.map((g) => g.contract);

    // Newest report per contract (for evidence/notes preview)
    const newestPerContract = (await prisma.stolenItem.findMany({
      where: { contract: { in: contracts }, source: "USER", status: "FLAGGED" },
      orderBy: { createdAt: "desc" },
      select: { contract: true, evidenceUrl: true, notes: true, createdAt: true },
    })) as NewestRow[];

    const newestMap: Record<string, { evidenceUrl: string | null; notes: string | null }> = {};
    for (const r of newestPerContract) {
      if (!newestMap[r.contract]) {
        newestMap[r.contract] = { evidenceUrl: r.evidenceUrl, notes: r.notes };
      }
    }

    // Optional collection metadata
    const metas = (await prisma.collection.findMany({
      where: { contract: { in: contracts } },
      select: { contract: true, name: true, symbol: true, logoUrl: true },
    })) as MetaRow[];
    const metaMap: Record<string, MetaRow> = Object.fromEntries(metas.map((m) => [m.contract, m]));

    // On-chain "is collection flagged" status
    const onChainMap: Record<string, boolean> = {};
    if (RPC_URL && REGISTRY) {
      const client = createPublicClient({ transport: http(RPC_URL) });
      for (const c of contracts) {
        try {
          const rep = (await client.readContract({
            address: REGISTRY,
            abi: STOLEN_REGISTRY_ABI as any,
            functionName: "getCollectionReport",
            args: [c as `0x${string}`],
          })) as any;
          // Support struct or tuple return
          const active = Boolean(rep?.active ?? (Array.isArray(rep) ? rep[0] : false));
          onChainMap[c] = active;
        } catch {
          onChainMap[c] = false;
        }
      }
    }

    const data = groups
      .map((g) => {
        const meta = metaMap[g.contract];
        const newest = newestMap[g.contract] || { evidenceUrl: null, notes: null };
        return {
          contract: g.contract,
          itemsReported: g._count._all,
          latestReportedAt: g._max.createdAt ? g._max.createdAt.toISOString() : null,
          name: meta?.name || null,
          symbol: meta?.symbol || null,
          logoUrl: meta?.logoUrl || null,
          onChainActive: onChainMap[g.contract] ?? false,
          evidenceUrl: newest.evidenceUrl,
          notes: newest.notes,
        };
      })
      .sort(
        (a, b) =>
          (b.latestReportedAt ? Date.parse(b.latestReportedAt) : 0) -
          (a.latestReportedAt ? Date.parse(a.latestReportedAt) : 0)
      );

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
