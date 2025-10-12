// app/api/presale/proof/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import {
  normalizeAndDedupe,
  buildTree,
  getRootHex,
  getProofHex,
} from "@/lib/allowlist";
import { isAddress, getAddress } from "ethers";

// In-memory cache (swap to Redis if multi-instance)
type CacheVal = {
  commitOrRoot: string;               // commit when available, else merkleRoot
  addresses: string[];                // canonical, checksummed, deduped
  builtAt: number;
};
const treeCache = new Map<string, CacheVal>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * GET /api/presale/proof?collection=0x...&address=0x...
 */
export async function GET(req: NextRequest) {
  await prismaReady;
  try {
    const { searchParams } = new URL(req.url);
    const collectionRaw = (searchParams.get("collection") || "").trim();
    const addressRaw = (searchParams.get("address") || "").trim();

    if (!isAddress(collectionRaw) || !isAddress(addressRaw)) {
      return NextResponse.json({ error: "Bad collection or address." }, { status: 400 });
    }

    const collectionChecksum = getAddress(collectionRaw);
    const userChecksum = getAddress(addressRaw);

    // Load collection + presale (+commit)
    const col = await prisma.collection.findUnique({
      where: { contract: collectionChecksum }, // CITEXT unique
      include: {
        presale: {
          select: {
            id: true,
            merkleRoot: true,
            allowlistCommit: true,
            whitelist: { select: { address: true } },
          },
        },
      },
    });

    if (!col?.presale?.merkleRoot) {
      return NextResponse.json(
        { error: "Presale not configured for this collection." },
        { status: 404 }
      );
    }

    const presale = col.presale;
    const cacheKey = collectionChecksum;
    let canonical: string[] = [];
    let commitOrRoot = presale.allowlistCommit || presale.merkleRoot;

    // Try cache first
    const now = Date.now();
    const cached = treeCache.get(cacheKey);
    if (cached && cached.commitOrRoot === commitOrRoot && now - cached.builtAt < CACHE_TTL_MS) {
      canonical = cached.addresses;
    } else {
      // Prefer draft by commit (exact same set/order used for the root)
      let sourceAddresses: string[] | null = null;

      if (presale.allowlistCommit) {
        const draft = await prisma.presaleDraft.findFirst({
          where: { sha256Commit: presale.allowlistCommit },
          select: { addresses: true },
        });
        if (draft?.addresses && Array.isArray(draft.addresses)) {
          sourceAddresses = draft.addresses as string[];
        }
      }

      // Fallback to materialized rows if no draft
      if (!sourceAddresses) {
        sourceAddresses = (presale.whitelist || []).map((w) => w.address);
      }

      const { canonical: canon } = normalizeAndDedupe(sourceAddresses);
      canonical = canon;

      if (canonical.length === 0) {
        return NextResponse.json(
          { error: "No allowlist entries found for this collection." },
          { status: 404 }
        );
      }

      treeCache.set(cacheKey, {
        commitOrRoot,
        addresses: canonical,
        builtAt: now,
      });
    }

    // Membership
    const set = new Set(canonical);
    if (!set.has(userChecksum)) {
      return NextResponse.json({ error: "Address not on allowlist." }, { status: 404 });
    }

    // Build tree & proof with the same library that produced the root
    const tree = buildTree(canonical);
    const computedRoot = getRootHex(tree);

    // Safety: root must match what was stored for this presale
    if (computedRoot.toLowerCase() !== presale.merkleRoot.toLowerCase()) {
      return NextResponse.json(
        {
          error: "root-mismatch",
          computedRoot,
          storedRoot: presale.merkleRoot,
        },
        { status: 409 }
      );
    }

    const proof = getProofHex(tree, userChecksum);
    return NextResponse.json({ proof, merkleRoot: presale.merkleRoot });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
