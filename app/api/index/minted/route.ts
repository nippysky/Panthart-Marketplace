// app/api/index/minted/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { NftStatus } from "@/lib/generated/prisma";

/* ---------------- small utils ---------------- */

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://lime-traditional-stork-669.mypinata.cloud/ipfs/",
];

function ipfsToHttp(u?: string | null) {
  if (!u) return "";
  if (!u.startsWith("ipfs://")) return u;
  const cid = u.slice(7);
  return `${IPFS_GATEWAYS[0]}${cid}`;
}

/** robust fetch with timeout + multi-gateway fallback */
async function fetchJsonWithFallback(ipfsUrl: string, timeoutMs = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);

  const tryOnce = async (url: string) => {
    const res = await fetch(url, {
      cache: "no-store",
      signal: ctl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  try {
    const primary = ipfsToHttp(ipfsUrl);
    try {
      const j = await tryOnce(primary);
      clearTimeout(timer);
      return j;
    } catch {
      const cid = ipfsUrl.startsWith("ipfs://") ? ipfsUrl.slice(7) : ipfsUrl;
      for (let i = 1; i < IPFS_GATEWAYS.length; i++) {
        try {
          const j = await tryOnce(`${IPFS_GATEWAYS[i]}${cid}`);
          clearTimeout(timer);
          return j;
        } catch {}
      }
      throw new Error("all-gateways-failed");
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Normalize ANY metadata shape into [{ trait_type, value, display_type? }] */
function normalizeAttributes(meta: any): Array<{ trait_type: string; value: any; display_type?: string }> {
  if (!meta || typeof meta !== "object") return [];

  const asPair = (k: any, v: any, display?: string) => ({
    trait_type: String(k ?? "Trait"),
    value: v,
    ...(display ? { display_type: String(display) } : {}),
  });

  // 1) OpenSea-style array
  if (Array.isArray(meta.attributes) && meta.attributes.length) {
    return meta.attributes
      .filter((a: any) => a && (a.trait_type != null || a.type != null))
      .map((a: any) => asPair(a.trait_type ?? a.type, a.value, a.display_type));
  }

  // 2) "traits" array
  if (Array.isArray(meta.traits) && meta.traits.length) {
    return meta.traits
      .filter((a: any) => a && (a.trait_type != null || a.type != null || a.key != null || a.name != null))
      .map((a: any) => asPair(a.trait_type ?? a.type ?? a.key ?? a.name, a.value ?? a.val ?? a.v, a.display_type));
  }

  // 3) attributes object map
  if (meta.attributes && typeof meta.attributes === "object" && !Array.isArray(meta.attributes)) {
    return Object.entries(meta.attributes).map(([k, v]) => asPair(k, v));
  }

  // 4) properties object map
  if (meta.properties && typeof meta.properties === "object") {
    const out: any[] = [];
    for (const [k, v] of Object.entries(meta.properties)) {
      if (v && typeof v === "object" && "value" in (v as any)) {
        out.push(asPair(k, (v as any).value));
      } else {
        out.push(asPair(k, v));
      }
    }
    if (out.length) return out;
  }

  // 5) stats/levels (obj or array)
  for (const bucket of ["stats", "levels"]) {
    const b = (meta as any)[bucket];
    if (b && typeof b === "object" && !Array.isArray(b)) {
      return Object.entries(b).map(([k, v]) => asPair(k, v, bucket));
    }
    if (Array.isArray(b) && b.length) {
      return b.map((a: any) =>
        asPair(a?.trait_type ?? a?.name ?? "Stat", a?.value ?? a?.score ?? a?.level, a?.display_type ?? bucket)
      );
    }
  }

  return [];
}

/* ---------------- handler ---------------- */

export async function POST(req: NextRequest) {
  await prismaReady;
  try {
    const body = await req.json();
    const { contract: rawContract, mints, txHash, minter } = body as {
      contract: string;
      mints: Array<{ tokenId: string; uri: string }>;
      txHash?: string;
      minter?: string;
    };

    if (!rawContract || !Array.isArray(mints) || mints.length === 0) {
      return NextResponse.json({ error: "bad-payload" }, { status: 400 });
    }

    // Prefer DB’s stored checksum if we already know this collection (no lowercasing anywhere)
    const collection = await prisma.collection.findFirst({
      where: { contract: { equals: rawContract, mode: "insensitive" } },
      select: { id: true, contract: true, standard: true },
    });

    const contract = collection?.contract ?? rawContract;
    const collectionId = collection?.id ?? null;
    const standard = collection?.standard ?? "ERC721";

    const createdIds: string[] = [];
    let createdCount = 0;

    for (const { tokenId, uri } of mints) {
      let name = `#${tokenId}`;
      let imageUrl = "";
      let description: string | undefined;
      let rawMetadata: any = null;
      let normalizedAttrs: Array<{ trait_type: string; value: any; display_type?: string }> = [];

      try {
        rawMetadata = await fetchJsonWithFallback(uri);
        if (rawMetadata && typeof rawMetadata === "object") {
          name = rawMetadata?.name || name;
          const media = rawMetadata?.animation_url || rawMetadata?.image || rawMetadata?.image_url;
          imageUrl = ipfsToHttp(media || "");
          description = rawMetadata?.description || undefined;
          normalizedAttrs = normalizeAttributes(rawMetadata);
        }
      } catch {
        // soft-fail; background indexer can retry fetch later
      }

      const existing = await prisma.nFT.findUnique({
        where: { contract_tokenId: { contract, tokenId } },
        select: { id: true },
      });

      // Base data (no optional foreign keys here to satisfy prisma checked/unchecked unions)
      const baseData = {
        contract,
        tokenId,
        name,
        imageUrl,
        description,
        tokenUri: uri,
        rawMetadata,
        standard,
        status: NftStatus.SUCCESS,
        retryCount: 0,
        ...(normalizedAttrs.length
          ? { traits: normalizedAttrs as any, attributes: normalizedAttrs as any }
          : {}),
      };

      let nftId: string;

      if (!existing) {
        const created = await prisma.nFT.create({
          data: collectionId ? { ...baseData, collectionId } : baseData,
          select: { id: true },
        });
        nftId = created.id;
        createdCount += 1;
      } else {
        const updated = await prisma.nFT.update({
          where: { contract_tokenId: { contract, tokenId } },
          data: collectionId ? { ...baseData, collectionId } : baseData,
          select: { id: true },
        });
        nftId = updated.id;
      }

      createdIds.push(nftId);

      if (txHash && minter) {
        // New composite unique: (txHash, logIndex). We record mint as logIndex=0.
        await prisma.nFTActivity
          .upsert({
            where: { txHash_logIndex: { txHash, logIndex: 0 } },
            update: {},
            create: {
              nftId,
              contract,
              tokenId,
              type: "MINT",
              fromAddress: "0x0000000000000000000000000000000000000000",
              toAddress: minter,
              txHash,
              logIndex: 0,
              blockNumber: 0,
              timestamp: new Date(),
              priceEtnWei: null,
            },
          })
          .catch(() => {});
      }
    }

    if (collectionId) {
      const count = await prisma.nFT.count({
        where: { collectionId, contract, status: NftStatus.SUCCESS },
      });
      await prisma.collection
        .update({ where: { id: collectionId }, data: { itemsCount: count } })
        .catch(() => {});
    }

    return NextResponse.json({ ok: true, createdCount, createdIds });
  } catch (e) {
    console.error("[POST /api/index/minted] failed:", e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}
