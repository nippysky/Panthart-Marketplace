// app/api/minting-now/[contract]/eligibility/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { getAddress } from "ethers";
import {
  normalizeAndDedupe,
  buildTree,
  getRootHex,
  getProofHex,
} from "@/lib/allowlist";

type PageParams = { params: Promise<{ contract: string }> };

/** Normalize to checksum; returns null on bad input */
function normalizeChecksum(addr: string): string | null {
  try {
    return getAddress(addr);
  } catch {
    return null;
  }
}

/** Draft-first resolution; fall back to materialized rows; always canonicalize with the library */
async function getCanonicalAllowlist(presaleId: string, allowlistCommit?: string | null) {
  // 1) Prefer PresaleDraft by commit (exact set used to build root)
  if (allowlistCommit) {
    const draft = await prisma.presaleDraft.findFirst({
      where: { sha256Commit: allowlistCommit },
      select: { addresses: true },
    });
    if (draft?.addresses && Array.isArray(draft.addresses)) {
      const { canonical } = normalizeAndDedupe(draft.addresses as string[]);
      if (canonical.length) return canonical;
    }
  }

  // 2) Fallback to materialized rows
  const rows = await prisma.presaleWhitelistAddress.findMany({
    where: { presaleId },
    select: { address: true },
  });
  const { canonical } = normalizeAndDedupe(rows.map((r) => r.address));
  return canonical;
}

export async function GET(req: NextRequest, context: PageParams) {
  await prismaReady;

  const { contract } = await context.params;
  const url = new URL(req.url);

  const walletRaw = (url.searchParams.get("wallet") || "").trim();
  const includeProof = ["1", "true", "yes"].includes(
    (url.searchParams.get("includeProof") || "").toLowerCase()
  );

  if (walletRaw && !/^0x[a-fA-F0-9]{40}$/.test(walletRaw)) {
    return NextResponse.json({ eligible: false, reason: "bad-wallet" }, { status: 400 });
  }
  const wallet = walletRaw ? normalizeChecksum(walletRaw) : null;

  try {
    const col = await prisma.collection.findFirst({
      where: {
        deployment: { is: { cloneAddress: { equals: contract, mode: "insensitive" } } },
      },
      include: {
        publicSale: true,
        presale: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            merkleRoot: true,
            allowlistCommit: true,
            whitelist: includeProof
              ? { select: { address: true } }
              : {
                  where: wallet ? { address: { equals: wallet, mode: "insensitive" } } : undefined,
                  select: { id: true, address: true },
                },
          },
        },
      },
    });

    if (!col || !col.publicSale) {
      return NextResponse.json({ eligible: false, reason: "not-found" }, { status: 404 });
    }

    const now = new Date();
    const presaleActive =
      !!col.presale && col.presale.startTime <= now && col.presale.endTime > now;

    // Public or presale not active → eligible without proof
    if (!presaleActive) {
      return NextResponse.json({
        eligible: true,
        reason: "ok",
        presaleActive: false,
        nextPublicStartISO: col.publicSale.startTime.toISOString(),
      });
    }

    // Presale active: must provide wallet
    if (!wallet) {
      return NextResponse.json({
        eligible: false,
        reason: "no-wallet",
        presaleActive: true,
        nextPublicStartISO: col.publicSale.startTime.toISOString(),
      });
    }

    // Fast membership path (no proof requested)
    if (!includeProof) {
      // If materialized rows have the wallet, we're good; otherwise try the draft set
      let wl = col.presale?.whitelist || [];
      if (!wl.length && col.presale?.allowlistCommit) {
        const draft = await prisma.presaleDraft.findFirst({
          where: { sha256Commit: col.presale.allowlistCommit },
          select: { addresses: true },
        });
        if (draft?.addresses && Array.isArray(draft.addresses)) {
          wl = (draft.addresses as string[]).map((a) => ({ address: a }));
        }
      }
      const wlSet = new Set(
        wl.map((w) => normalizeChecksum((w as any).address)).filter((x): x is string => !!x)
      );
      const whitelisted = wlSet.has(wallet);

      return NextResponse.json({
        eligible: whitelisted,
        reason: whitelisted ? "ok" : "not-whitelisted",
        presaleActive: true,
        nextPublicStartISO: col.publicSale.startTime.toISOString(),
      });
    }

    // includeProof path — build from the SAME canonical list used for the root
    const presale = col.presale!;
    const canonical = await getCanonicalAllowlist(presale.id, presale.allowlistCommit);

    if (!canonical.length) {
      return NextResponse.json({
        eligible: false,
        reason: "proof-unavailable",
        presaleActive: true,
        nextPublicStartISO: col.publicSale.startTime.toISOString(),
      });
    }

    // Wallet must be present
    if (!new Set(canonical).has(wallet)) {
      return NextResponse.json({
        eligible: false,
        reason: "not-whitelisted",
        presaleActive: true,
        nextPublicStartISO: col.publicSale.startTime.toISOString(),
      });
    }

    // Build tree/proof and validate root with the exact same library
    const tree = buildTree(canonical);
    const computedRoot = getRootHex(tree);

    if (presale.merkleRoot && computedRoot.toLowerCase() !== presale.merkleRoot.toLowerCase()) {
      return NextResponse.json({
        eligible: false,
        reason: "root-mismatch",
        presaleActive: true,
        nextPublicStartISO: col.publicSale.startTime.toISOString(),
      });
    }

    const proof = getProofHex(tree, wallet);
    return NextResponse.json({
      eligible: true,
      reason: "ok",
      presaleActive: true,
      nextPublicStartISO: col.publicSale.startTime.toISOString(),
      proof,
      merkleRoot: presale.merkleRoot || computedRoot,
    });
  } catch (err) {
    console.error("[eligibility]", err);
    return NextResponse.json({ eligible: false, reason: "server-error" }, { status: 500 });
  }
}
