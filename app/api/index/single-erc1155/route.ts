// app/api/index/single-erc1155/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import {
  Prisma,
  ContractType,
  MetadataOption,
  IndexStatus,
  NftStatus,
} from "@/lib/generated/prisma";
import { notifySingle1155Created } from "@/lib/telegram";

/* ───────────────── helpers ───────────────── */

function asDecimalString(x: string | number | bigint): string {
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(Math.trunc(x));
  return x.toString();
}

function normalizeIpfsBase(u: string) {
  if (!u) return u;
  const t = u.trim().replace(/\/+$/, "");
  return t.startsWith("ipfs://") ? t : `ipfs://${t}`;
}

function ipfsToHttp(u: string) {
  if (!u) return u;
  return u.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${u.slice(7)}` : u;
}

async function fetchJsonWithTimeout(url: string, ms = 12_000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
    if (!res.ok) throw new Error(`(${res.status}) ${await res.text()}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function parseMetadata(raw: any): {
  raw: Prisma.InputJsonValue;
  attributes: Prisma.InputJsonValue;
  traits: Prisma.InputJsonValue;
  name?: string;
  description?: string | null;
  image?: string;
} {
  if (!raw || typeof raw !== "object") return { raw: {}, attributes: [], traits: {} };

  let attributes: any[] = [];
  if (Array.isArray((raw as any).attributes)) {
    attributes = (raw as any).attributes.filter((a: any) => a && typeof a === "object");
  } else if ((raw as any).attributes && typeof (raw as any).attributes === "object") {
    attributes = Object.entries((raw as any).attributes).map(([k, v]) => ({
      trait_type: k,
      value: v,
    }));
  }
  const traits: Record<string, any> = {};
  for (const a of attributes) {
    const k = String((a as any).trait_type ?? "").trim();
    if (k) traits[k] = (a as any).value;
  }

  const name = typeof (raw as any).name === "string" ? (raw as any).name : undefined;
  const description =
    typeof (raw as any).description === "string" ? (raw as any).description : null;
  const image =
    typeof (raw as any).image === "string"
      ? (raw as any).image
      : typeof (raw as any).image_url === "string"
      ? (raw as any).image_url
      : undefined;

  return {
    raw: raw as any,
    attributes,
    traits,
    ...(name ? { name } : {}),
    ...(typeof description !== "undefined" ? { description } : {}),
    ...(image ? { image } : {}),
  };
}

/** Tiny retry for transient errors (timeouts, “transaction already closed”, deadlocks) */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 300): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || "");
      if (!/Transaction already closed|deadlock|timeout|ETIMEDOUT|ECONNRESET|Connection terminated/i.test(msg)) {
        break; // non-transient → don't retry
      }
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}

/* ────────────────────────── POST handler ────────────────────────── */

export async function POST(req: NextRequest) {
  await prismaReady;

  try {
    const body = await req.json();

    const required = [
      "txHash",
      "contract",
      "factoryAddress",
      "deployerAddress",
      "feeRecipient",
      "feeAmountEtnWei",
      "royaltyRecipient",
      "royaltyBps",
      "name",
      "symbol",
      "baseUri",
      "maxSupply",
      "mintPriceEtnWei",
      "maxPerWallet",
      "ownerAddress",
    ] as const;

    for (const k of required) {
      if (body[k] == null || (typeof body[k] === "string" && body[k].trim() === "")) {
        return NextResponse.json({ error: `Missing required field: ${k}` }, { status: 400 });
      }
    }

    const {
      txHash,
      blockNumber,
      contract,
      implementationAddr,
      factoryAddress,
      deployerAddress,
      feeRecipient,
      feeAmountEtnWei,
      royaltyRecipient,
      royaltyBps,
      name,
      symbol,
      baseUri,
      maxSupply,
      mintPriceEtnWei,
      maxPerWallet,
      creatorUserId,
      creatorWalletAddress,
      ownerAddress,
      description = null,
      imageUrl = null,
      assetCid,
      jsonCid,
      uploaderUserId,
    } = body as {
      txHash: string;
      blockNumber?: number;
      contract: string;
      implementationAddr?: string | null;
      factoryAddress: string;
      deployerAddress: string;
      feeRecipient: string;
      feeAmountEtnWei: string | number | bigint;
      royaltyRecipient: string;
      royaltyBps: number;
      name: string;
      symbol: string;
      baseUri: string;
      maxSupply: number;
      mintPriceEtnWei: string | number | bigint;
      maxPerWallet: number;
      creatorUserId?: string;
      creatorWalletAddress?: string;
      ownerAddress: string;
      description?: string | null;
      imageUrl?: string | null;
      assetCid?: string;
      jsonCid?: string;
      uploaderUserId?: string | null;
    };

    /* ── ensure creator user (idempotent) ── */
    let creatorId: string;
    if (creatorUserId && creatorUserId.trim()) {
      creatorId = creatorUserId.trim();
    } else {
      const wallet = (creatorWalletAddress || deployerAddress || ownerAddress || "").trim();
      if (!wallet) {
        return NextResponse.json(
          { error: "Cannot resolve creator user: missing wallet address." },
          { status: 400 }
        );
      }
      const existing = await prisma.user.findFirst({
        where: { walletAddress: { equals: wallet, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing?.id) {
        creatorId = existing.id;
      } else {
        // Keep original casing (no lowercasing)
        const short = wallet.startsWith("0x") ? wallet.slice(2, 8) : wallet.slice(0, 6);
        const created = await prisma.user.create({
          data: {
            walletAddress: wallet,
            username: `${short}`,
            profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${short}`,
            profileBanner:
              "https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png",
          },
          select: { id: true },
        });
        creatorId = created.id;
      }
    }

    const bn = typeof blockNumber === "number" && blockNumber >= 0 ? blockNumber : 0;
    const normBase = normalizeIpfsBase(baseUri);
    const tokenUri = `${normBase}/1.json`;

    /* ──────────────────────────
       MAIN WRITES (idempotent, sequential; no interactive tx)
       Each step retried on transient errors.
       ────────────────────────── */

    // 1) Single1155
    const single = await withRetry(() =>
      prisma.single1155.upsert({
        where: { contract }, // unique
        create: {
          name,
          symbol,
          contract,
          baseUri: normBase,
          maxSupply,
          mintPriceEtnWei: new Prisma.Decimal(asDecimalString(mintPriceEtnWei)),
          maxPerWallet,
          royaltyRecipient,
          royaltyBps,
          creatorId,
          ownerAddress,
          description: description ?? null,
          imageUrl: imageUrl ?? null,
          indexStatus: IndexStatus.COMPLETED,
        },
        update: {
          baseUri: normBase,
          maxSupply,
          mintPriceEtnWei: new Prisma.Decimal(asDecimalString(mintPriceEtnWei)),
          maxPerWallet,
          royaltyRecipient,
          royaltyBps,
          ownerAddress,
          description: description ?? null,
          imageUrl: imageUrl ?? null,
          indexStatus: IndexStatus.COMPLETED,
        },
        select: { id: true },
      })
    );

    // 2) NFT token #1 (preview)
    const nft = await withRetry(() =>
      prisma.nFT.upsert({
        where: { contract_tokenId: { contract, tokenId: "1" } }, // unique
        create: {
          tokenId: "1",
          name,
          imageUrl: imageUrl ?? "",
          description: description ?? null,
          tokenUri,
          contract,
          standard: "ERC1155",
          royaltyBps,
          royaltyRecipient,
          single1155Id: single.id,
          status: NftStatus.SUCCESS,
        },
        update: {
          name,
          imageUrl: imageUrl ?? "",
          description: description ?? null,
          tokenUri,
          royaltyBps,
          royaltyRecipient,
          single1155Id: single.id,
          status: NftStatus.SUCCESS,
        },
        select: { id: true },
      })
    );

    // 3) DeployedContract
    await withRetry(() =>
      prisma.deployedContract.upsert({
        where: { cloneAddress: contract }, // unique
        create: {
          contractType: ContractType.ERC1155_SINGLE,
          cloneAddress: contract,
          implementationAddr: implementationAddr ?? "",
          factoryAddress,
          deployerAddress,
          txHash, // unique across table – good for tracing
          blockNumber: bn,
          metadataOption: MetadataOption.UPLOAD,
          feeRecipient,
          feeAmountEtnWei: new Prisma.Decimal(asDecimalString(feeAmountEtnWei)),
          royaltyRecipient,
          royaltyBps,
          baseURI: normBase,
          maxSupply,
          rawInit: {
            name,
            symbol,
            baseUri: normBase,
            maxSupply,
            mintPriceEtnWei: asDecimalString(mintPriceEtnWei),
            maxPerWallet,
            royaltyRecipient,
            royaltyBps,
          } as Prisma.InputJsonValue,
          single1155Id: single.id,
        },
        update: {
          txHash,
          blockNumber: bn,
          implementationAddr: implementationAddr ?? "",
          feeRecipient,
          feeAmountEtnWei: new Prisma.Decimal(asDecimalString(feeAmountEtnWei)),
          royaltyRecipient,
          royaltyBps,
          baseURI: normBase,
          maxSupply,
          rawInit: {
            name,
            symbol,
            baseUri: normBase,
            maxSupply,
            mintPriceEtnWei: asDecimalString(mintPriceEtnWei),
            maxPerWallet,
            royaltyRecipient,
            royaltyBps,
          } as Prisma.InputJsonValue,
          single1155Id: single.id,
        },
      })
    );

    /* ──────────────────────────
       NON-CRITICAL / BEST-EFFORT (outside main path)
       ────────────────────────── */

    // 4) AssetUpload audit rows (best-effort; independent writes)
    try {
      const uploader = uploaderUserId ?? creatorId;
      const ops: Promise<any>[] = [];
      const pushUpload = (cid: string | undefined | null) => {
        const c = cid?.trim();
        if (!c) return;
        ops.push(
          prisma.assetUpload.create({
            data: {
              provider: "PINATA",
              cid: c,
              url: `https://ipfs.io/ipfs/${c}`,
              uploaderUserId: uploader,
              single1155: { connect: { id: single.id } },
            },
          })
        );
      };
      pushUpload(assetCid);
      pushUpload(jsonCid);
      if (ops.length) await Promise.all(ops);
    } catch (e) {
      console.warn("single-erc1155 assetUpload audit skipped:", (e as any)?.message || e);
    }

    // 5) Enrich metadata for NFT#1 (best-effort)
    try {
      const http = ipfsToHttp(tokenUri);
      const raw = await fetchJsonWithTimeout(http, 12_000);
      const meta = parseMetadata(raw);
      await prisma.nFT.update({
        where: { id: nft.id },
        data: {
          rawMetadata: meta.raw,
          attributes: meta.attributes,
          traits: meta.traits,
          ...(meta.name ? { name: meta.name } : {}),
          ...(typeof meta.description !== "undefined" ? { description: meta.description } : {}),
          ...(meta.image ? { imageUrl: ipfsToHttp(meta.image) } : {}),
        },
      });
    } catch (e) {
      console.error("single-erc1155 metadata enrich skipped:", (e as any)?.message || e);
    }

    // 6) Telegram notify (best-effort)
    try {
      await notifySingle1155Created({
        id: single.id,
        name,
        symbol,
        contract,
        supply: maxSupply,
        tokenId: "1",
        owner: ownerAddress,
        deployer: deployerAddress,
        mintPriceWei: asDecimalString(mintPriceEtnWei),
      });
    } catch (e) {
      console.warn("[telegram] notifySingle1155Created failed:", (e as any)?.message || e);
    }

    return NextResponse.json({ ok: true, singleId: single.id, nftId: nft.id, tokenUri });
  } catch (err: any) {
    console.error("index/single-erc1155 POST error", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
