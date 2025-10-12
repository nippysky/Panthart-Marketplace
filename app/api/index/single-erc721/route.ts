// app/api/index/single-erc721/route.ts
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
import { notifySingle721Created } from "@/lib/telegram";

/* ---------- helpers ---------- */

function asDecimalString(x: string | number | bigint): string {
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(Math.trunc(x));
  return x.toString();
}

function toHttp(u: string) {
  return u?.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${u.slice(7)}` : u;
}

async function fetchTokenJson(tokenUri: string) {
  try {
    const res = await fetch(toHttp(tokenUri), { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j || typeof j !== "object") return null;

    const attributes = Array.isArray((j as any).attributes) ? (j as any).attributes : [];

    const traits: Record<string, string> = {};
    for (const a of attributes) {
      const k = (a?.trait_type ?? "").toString();
      const v = (a?.value ?? "").toString();
      if (k) traits[k] = v;
    }

    return { raw: j, attributes, traits };
  } catch {
    return null;
  }
}

/** Tiny retry for transient hiccups */
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

/* ---------- handler ---------- */

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
      "tokenUri",
      "ownerAddress",
    ] as const;

    for (const k of required) {
      if (
        body[k] === undefined ||
        body[k] === null ||
        (typeof body[k] === "string" && body[k].trim() === "")
      ) {
        return NextResponse.json({ error: `Missing required field: ${k}` }, { status: 400 });
      }
    }

    const {
      txHash,
      blockNumber,
      contract,
      implementationAddr, // may be "", we still persist
      factoryAddress,
      deployerAddress,

      feeRecipient,
      feeAmountEtnWei,

      royaltyRecipient,
      royaltyBps,

      name,
      symbol,
      tokenUri,

      creatorUserId,
      creatorWalletAddress,

      ownerAddress,

      description = null,
      imageUrl = null,

      assetCid,
      jsonCid,
      uploaderUserId,
    }: {
      txHash: string;
      blockNumber?: number;
      contract: string;
      implementationAddr?: string | null;
      factoryAddress: string;
      deployerAddress: string;

      feeRecipient: string;
      feeAmountEtnWei: string | number;

      royaltyRecipient: string;
      royaltyBps: number;

      name: string;
      symbol: string;
      tokenUri: string;

      creatorUserId?: string;
      creatorWalletAddress?: string;

      ownerAddress: string;

      description?: string | null;
      imageUrl?: string | null;

      assetCid?: string;
      jsonCid?: string;
      uploaderUserId?: string | null;
    } = body;

    // ensure creator user
    let creatorId: string;
    if (typeof creatorUserId === "string" && creatorUserId.trim()) {
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

    // ensure owner user so UI doesn't show "Unknown"
    let ownerUserId: string;
    {
      const existing = await prisma.user.findFirst({
        where: { walletAddress: { equals: ownerAddress, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing?.id) {
        ownerUserId = existing.id;
      } else {
        const short = ownerAddress.startsWith("0x")
          ? ownerAddress.slice(2, 8)
          : ownerAddress.slice(0, 6);
        const created = await prisma.user.create({
          data: {
            walletAddress: ownerAddress,
            username: `${short}`,
            profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${short}`,
            profileBanner:
              "https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png",
          },
          select: { id: true },
        });
        ownerUserId = created.id;
      }
    }

    // fetch token metadata to populate raw/attributes/traits (network I/O BEFORE DB writes is fine)
    const meta = await fetchTokenJson(tokenUri);
    const rawMetadata = (meta?.raw as unknown as Prisma.InputJsonValue) ?? null;
    const attributes = (meta?.attributes as unknown as Prisma.InputJsonValue) ?? null;
    const traits = (meta?.traits as unknown as Prisma.InputJsonValue) ?? null;

    const bn = typeof blockNumber === "number" && blockNumber >= 0 ? blockNumber : 0;

    /* ───────── MAIN WRITES (no interactive tx; idempotent + retries) ───────── */

    // 1) Single721
    const single = await withRetry(() =>
      prisma.single721.upsert({
        where: { contract }, // unique
        create: {
          name,
          symbol,
          contract,
          tokenUri,
          royaltyRecipient,
          royaltyBps,
          creatorId,
          ownerAddress,
          description: description ?? null,
          imageUrl: imageUrl ?? null,
          indexStatus: IndexStatus.COMPLETED,
        },
        update: {
          tokenUri,
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

    // 2) NFT #1
    const nft = await withRetry(() =>
      prisma.nFT.upsert({
        where: { contract_tokenId: { contract, tokenId: "1" } }, // unique @@
        create: {
          tokenId: "1",
          name,
          imageUrl: imageUrl ?? "",
          description: description ?? null,
          tokenUri,
          contract,
          standard: "ERC721",
          royaltyBps,
          royaltyRecipient,
          single721Id: single.id,
          ownerId: ownerUserId,
          rawMetadata,
          attributes,
          traits,
          status: NftStatus.SUCCESS,
        },
        update: {
          name,
          imageUrl: imageUrl ?? "",
          description: description ?? null,
          tokenUri,
          royaltyBps,
          royaltyRecipient,
          single721Id: single.id,
          ownerId: ownerUserId,
          rawMetadata,
          attributes,
          traits,
          status: NftStatus.SUCCESS,
        },
        select: { id: true },
      })
    );

    // 3) DeployedContract
    const rawInitSnapshot: Record<string, any> = {
      // deployment args / economics
      name,
      symbol,
      tokenUri,
      royaltyRecipient,
      royaltyBps,
      feeRecipient,
      feeAmountEtnWei: asDecimalString(feeAmountEtnWei),

      // infra
      factoryAddress,
      deployerAddress,
      implementationAddr: implementationAddr ?? "",
      txHash,
      blockNumber: bn,

      // single-721 invariants
      baseURI: tokenUri,
      maxSupply: 1,

      // UI helpers / audit
      ownerAddress,
      imageUrl,
      assetCid: assetCid ?? null,
      jsonCid: jsonCid ?? null,
    };

    await withRetry(() =>
      prisma.deployedContract.upsert({
        where: { cloneAddress: contract }, // unique
        create: {
          contractType: ContractType.ERC721_SINGLE,
          cloneAddress: contract,
          implementationAddr: implementationAddr ?? "",
          factoryAddress,
          deployerAddress,
          txHash,
          blockNumber: bn,
          metadataOption: MetadataOption.UPLOAD,
          feeRecipient,
          feeAmountEtnWei: new Prisma.Decimal(asDecimalString(feeAmountEtnWei)),
          royaltyRecipient,
          royaltyBps,
          baseURI: tokenUri,
          maxSupply: 1,
          rawInit: rawInitSnapshot as Prisma.InputJsonValue,
          single721Id: single.id,
        },
        update: {
          txHash,
          blockNumber: bn,
          implementationAddr: implementationAddr ?? "",
          feeRecipient,
          feeAmountEtnWei: new Prisma.Decimal(asDecimalString(feeAmountEtnWei)),
          royaltyRecipient,
          royaltyBps,
          baseURI: tokenUri,
          maxSupply: 1,
          rawInit: rawInitSnapshot as Prisma.InputJsonValue,
          single721Id: single.id,
        },
      })
    );

    /* ───────── NON-CRITICAL / BEST-EFFORT (outside main path) ───────── */

    // 4) AssetUpload audit rows
    try {
      const uploader = uploaderUserId ?? creatorId;
      const ops: Promise<any>[] = [];
      const push = (cid?: string | null) => {
        const c = cid?.trim();
        if (!c) return;
        ops.push(
          prisma.assetUpload.create({
            data: {
              provider: "PINATA",
              cid: c,
              url: `https://ipfs.io/ipfs/${c}`,
              uploaderUserId: uploader,
              single721: { connect: { id: single.id } },
            },
          })
        );
      };
      push(assetCid);
      push(jsonCid);
      if (ops.length) await Promise.all(ops);
    } catch (e) {
      console.warn("single-erc721 assetUpload audit skipped:", (e as any)?.message || e);
    }

    // 5) Mint activity log (best-effort)
    try {
      await prisma.nFTActivity.upsert({
        where: { txHash_logIndex: { txHash, logIndex: 0 } },
        update: {},
        create: {
          nftId: nft.id,
          contract,
          tokenId: "1",
          type: "MINT",
          fromAddress: "0x0000000000000000000000000000000000000000",
          toAddress: ownerAddress,
          txHash,
          logIndex: 0,
          blockNumber: bn,
          timestamp: new Date(),
          priceEtnWei: null,
        },
      });
    } catch (e) {
      console.warn("single-erc721 mint activity skipped:", (e as any)?.message || e);
    }

    // 6) Telegram notify (best-effort)
    try {
      await notifySingle721Created({
        id: single.id,
        name,
        symbol,
        contract,
        supply: 1,
        tokenId: "1",
        owner: ownerAddress,
        deployer: deployerAddress,
      });
    } catch (e) {
      console.warn("[telegram] notifySingle721Created failed:", (e as any)?.message || e);
    }

    return NextResponse.json({
      ok: true,
      single721Id: single.id,
      nftId: nft.id,
    });
  } catch (err: any) {
    console.error("index/single-erc721 POST error", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
