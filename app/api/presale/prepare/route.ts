export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import {
  splitToCandidates,
  normalizeAndDedupe,
  buildTree,
  getRootHex,
  sha256Commit,
} from "@/lib/allowlist";
import { requireWalletAddress } from "@/lib/auth";

/**
 * POST /api/presale/prepare
 * Body: { addressesText?: string, csvText?: string }
 *
 * - Appends current "Non-Fungible Comrades" holders (>=100) automatically.
 * - Never lowercases addresses; checksum-normalizes only for validation/dedup.
 * - If an existing draft with the same commit is CONSUMED, we "revive" it to FINALIZED
 *   (QoL for reuse), while updating addresses/count/root.
 */

// ---------- helpers ----------

async function getComradesContract(): Promise<string> {
  let CONTRACT = process.env.PANTHART_NFC_CONTRACT?.trim();
  if (CONTRACT) return CONTRACT;

  const col = await prisma.collection.findFirst({
    where: { name: { equals: "Non-Fungible Comrades", mode: "insensitive" } },
    select: { contract: true },
  });
  if (col?.contract) return col.contract;

  throw new Error("Missing PANTHART_NFC_CONTRACT env and collection not found by name.");
}

async function getComradesEligibleHolders(contract: string, minComrades = 100): Promise<string[]> {
  type Row = { walletAddress?: string; walletaddress?: string };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT u."walletAddress" AS "walletAddress"
    FROM "NFT" n
    JOIN "User" u ON u.id = n."ownerId"
    WHERE n.contract = ${contract}::citext
      AND n.status = 'SUCCESS'
      AND n."ownerId" IS NOT NULL
    GROUP BY u.id, u."walletAddress"
    HAVING COUNT(n.*) >= ${minComrades}
  `;
  return rows
    .map((r) => (r as any).walletAddress ?? (r as any).walletaddress)
    .filter((a: any) => typeof a === "string" && a.trim().length > 0) as string[];
}

// ---------- route ----------

export async function POST(req: NextRequest) {
  await prismaReady;
  try {
    const creatorAddress = await requireWalletAddress();

    const body = await req.json();
    const addressesText: string = (body?.addressesText || "").toString();
    const csvText: string = (body?.csvText || "").toString();
    const raw = (addressesText || csvText || "").trim();

    if (!raw) {
      return NextResponse.json({ error: "No addresses provided." }, { status: 400 });
    }

    // 0) Parse user input
    const userCandidates = splitToCandidates(raw);
    const inputTotal = userCandidates.length;

    // 1) Comrades (>=100)
    const comradesContract = await getComradesContract();
    const comradesHolders = await getComradesEligibleHolders(comradesContract, 100);

    // 2) Canonicalization and statistics
    const userNorm = normalizeAndDedupe(userCandidates);
    const comradesNorm = normalizeAndDedupe(comradesHolders);

    const mergedCandidates = [...userCandidates, ...comradesHolders];
    const { canonical, invalid, duplicates } = normalizeAndDedupe(mergedCandidates);

    const userOnlySet = new Set(userNorm.canonical.map((a) => a));
    let appendedFromComrades = 0;
    for (const a of comradesNorm.canonical) {
      if (!userOnlySet.has(a)) appendedFromComrades++;
    }

    if (canonical.length === 0) {
      return NextResponse.json({ error: "At least one address is required." }, { status: 400 });
    }

    // 3) Merkle + commit
    const tree = buildTree(canonical);
    const merkleRoot = getRootHex(tree);
    const commit = sha256Commit(canonical);

    // 4) Upsert draft by commit — and "revive" if it was CONSUMED
    const existing = await prisma.presaleDraft.findUnique({
      where: { sha256Commit: commit },
      select: {
        id: true,
        status: true,
      },
    });

    let draftId: string;

    if (existing) {
      const updated = await prisma.presaleDraft.update({
        where: { sha256Commit: commit },
        data: {
          addresses: canonical as unknown as any,
          count: canonical.length,
          merkleRoot,
          ...(existing.status === "CONSUMED"
            ? { status: "FINALIZED", consumedAt: null, consumedByPresaleId: null }
            : {}),
        },
        select: { id: true },
      });
      draftId = updated.id;
    } else {
      const created = await prisma.presaleDraft.create({
        data: {
          creatorUserId: creatorAddress,
          addresses: canonical as unknown as any,
          count: canonical.length,
          merkleRoot,
          sha256Commit: commit,
          status: "FINALIZED", // nice default; creator can still change later
        },
        select: { id: true },
      });
      draftId = created.id;
    }

    // 5) Respond
    return NextResponse.json({
      ok: true,
      draftId,
      merkleRoot,
      commit,
      counts: {
        inputTotal,
        valid: canonical.length,
        invalid: invalid.length,
        duplicates: duplicates.length,
        appendedFromComrades,
        comradesQueried: comradesHolders.length,
      },
      preview: canonical.slice(0, 3),
      remaining: Math.max(0, canonical.length - 3),
      flags: { autoIncludedComrades: true },
    });
  } catch (e: any) {
    if (e?.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
